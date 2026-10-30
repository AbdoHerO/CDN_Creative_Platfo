import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { getEnv, getStorageConfig, type StorageConfig } from "@/lib/env";
import { contentDisposition } from "@/lib/files/naming";

/**
 * Object storage access through the S3 API (RustFS, or any S3-compatible server).
 *
 * - Credentials never leave the server. Browsers only receive short-lived
 *   presigned URLs scoped to a single object/part.
 * - Originals are uploaded byte-for-byte; nothing here transforms content.
 */

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "File storage is not configured. Set URL_RUSTFS, BUCKET_NAME, ACCESS_KEY and SECRET_KEY.",
    );
    this.name = "StorageNotConfiguredError";
  }
}

let client: { s3: S3Client; config: StorageConfig } | null = null;

function storage() {
  if (client) return client;
  const config = getStorageConfig();
  if (!config) throw new StorageNotConfiguredError();
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    // RustFS serves buckets path-style (https://host/bucket/key): one storage
    // origin for the Content-Security-Policy, no wildcard DNS needed.
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Presigned browser uploads cannot carry the SDK's default CRC32 checksums;
    // only send checksums when an operation strictly requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  client = { s3, config };
  return client;
}

export function storageEndpointOrigin(): string | null {
  const config = getStorageConfig();
  if (!config) return null;
  try {
    return new URL(config.endpoint).origin;
  } catch {
    return null;
  }
}

// ── Direct browser uploads ───────────────────────────────────────────────────

export async function presignPutObject(key: string, contentType: string, expiresIn = 3600) {
  const { s3, config } = storage();
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }), {
    expiresIn,
    signableHeaders: new Set(["content-type"]),
  });
}

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const { s3, config } = storage();
  const res = await s3.send(new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error("Storage did not return an upload id");
  return res.UploadId;
}

export async function presignUploadPart(key: string, uploadId: string, partNumber: number, expiresIn = 3600) {
  const { s3, config } = storage();
  return getSignedUrl(
    s3,
    new UploadPartCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
    { expiresIn },
  );
}

export type UploadedPart = { partNumber: number; etag: string; size: number };

export async function listUploadedParts(key: string, uploadId: string): Promise<UploadedPart[]> {
  const { s3, config } = storage();
  const parts: UploadedPart[] = [];
  let marker: string | undefined;
  for (;;) {
    const res = await s3.send(
      new ListPartsCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }),
    );
    for (const p of res.Parts ?? []) {
      if (p.PartNumber && p.ETag) parts.push({ partNumber: p.PartNumber, etag: p.ETag, size: p.Size ?? 0 });
    }
    if (!res.IsTruncated || !res.NextPartNumberMarker) break;
    marker = res.NextPartNumberMarker;
  }
  return parts.sort((a, b) => a.partNumber - b.partNumber);
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  const { s3, config } = storage();
  await s3.send(
    new CompleteMultipartUploadCommand({
      Bucket: config.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: [...parts].sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  const { s3, config } = storage();
  try {
    await s3.send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

// ── Object access ────────────────────────────────────────────────────────────

export async function headObject(key: string): Promise<{ size: number; contentType?: string; etag?: string } | null> {
  const { s3, config } = storage();
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType, etag: res.ETag };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getObjectHead(key: string, bytes = 4100): Promise<Uint8Array> {
  const { s3, config } = storage();
  const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
  if (!res.Body) return new Uint8Array();
  return res.Body.transformToByteArray();
}

export async function getObjectStream(key: string): Promise<Readable> {
  const { s3, config } = storage();
  const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
  if (!res.Body) throw new Error(`Object ${key} has no body`);
  return res.Body as Readable;
}

export async function putObject(key: string, body: Buffer | Uint8Array, contentType: string, cacheControl?: string) {
  const { s3, config } = storage();
  await s3.send(
    new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl }),
  );
}

/** Stream an arbitrarily large body to storage using managed multipart upload. */
export async function uploadStream(key: string, body: Readable, contentType: string) {
  const { s3, config } = storage();
  const partSize = getEnv().UPLOAD_PART_SIZE_MB * 1024 * 1024;
  const upload = new Upload({
    client: s3,
    params: { Bucket: config.bucket, Key: key, Body: body, ContentType: contentType },
    partSize,
    queueSize: 4,
    leavePartsOnError: false,
  });
  await upload.done();
}

export async function deleteObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return;
  const { s3, config } = storage();
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const res = await s3.send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    const errors = (res.Errors ?? []).filter((e) => e.Code !== "NoSuchKey");
    if (errors.length) throw new Error(`Failed to delete ${errors.length} object(s): ${errors[0].Code} ${errors[0].Message}`);
  }
}

export async function* listAllObjects(prefix?: string): AsyncGenerator<{ key: string; size: number; lastModified?: Date }> {
  const { s3, config } = storage();
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) yield { key: o.Key, size: Number(o.Size ?? 0), lastModified: o.LastModified };
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

// ── Signed read URLs ─────────────────────────────────────────────────────────

export type SignedUrlOptions = {
  /** inline → preview in browser, attachment → download with original filename. */
  disposition?: "inline" | "attachment";
  filename?: string;
  contentType?: string;
  expiresIn?: number;
  /**
   * Cacheable URL for in-app media (thumbnails, videos, images): signed at the
   * start of a time window of half the TTL and valid for the whole TTL, so every
   * page load in that window gets the same URL, and the response carries a
   * matching Cache-Control. Browsers then reuse what they already downloaded.
   */
  stable?: boolean;
};

export async function signedGetUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
  const { s3, config } = storage();
  const env = getEnv();
  const disposition = opts.filename ? contentDisposition(opts.disposition ?? "inline", opts.filename) : undefined;
  const ttl = opts.stable ? Math.max(env.SIGNED_URL_TTL_SECONDS, 2 * 3600) : (opts.expiresIn ?? env.SIGNED_URL_TTL_SECONDS);
  const windowSeconds = Math.floor(ttl / 2);
  const signingDate = opts.stable ? new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000) : undefined;
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseContentDisposition: disposition,
      ResponseContentType: opts.contentType,
      // Originals are uploaded by browsers without caching metadata. A stable URL stays
      // valid at least windowSeconds after it is first used, so caching that long is safe.
      ResponseCacheControl: opts.stable ? `private, max-age=${windowSeconds}` : undefined,
    }),
    { expiresIn: ttl, signingDate },
  );
}

/** Best-effort signed URL: returns null when storage is unavailable. */
export async function trySignedGetUrl(key: string | null | undefined, opts?: SignedUrlOptions): Promise<string | null> {
  if (!key) return null;
  try {
    return await signedGetUrl(key, opts);
  } catch {
    return null;
  }
}

export function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.name === "NoSuchUpload" || e?.$metadata?.httpStatusCode === 404;
}

/** Ensure the bucket accepts requests (used by health checks). */
export async function checkStorage(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { s3, config } = storage();
    await s3.send(new ListObjectsV2Command({ Bucket: config.bucket, MaxKeys: 1 }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
