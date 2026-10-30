"use client";

import { createSHA256 } from "hash-wasm";

/**
 * Browser upload engine.
 *
 * - Uploads go straight from the browser to R2 using presigned URLs; the app
 *   server only signs requests and never touches the bytes.
 * - Multipart uploads run several parts in parallel, retry failed parts with
 *   exponential backoff, and resume from the parts R2 already has.
 * - A SHA-256 of the original file is computed while uploading; the worker
 *   recomputes it from the stored object to prove nothing was altered.
 */

export type UploadSessionInfo = {
  sessionId: string;
  mode: "SINGLE" | "MULTIPART";
  partSize: number | null;
  partCount: number | null;
  mimeType: string;
  singleUrl: string | null;
};

export type UploadProgress = { uploadedBytes: number; totalBytes: number; phase: "hashing" | "uploading" | "finalizing" };

export type CompleteResult = { kind: "file"; fileId: string; creativeId: string } | { kind: "import"; batchId: string };

export class UploadError extends Error {
  constructor(
    message: string,
    public retryable = true,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

const PART_CONCURRENCY = 4;
const PART_RETRIES = 4;
const URL_BATCH = 20;
const HASH_CHUNK = 8 * 1024 * 1024;

async function api<T>(url: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new UploadError(body.error ?? `Request failed (${res.status})`, res.status >= 500 || res.status === 429);
  }
  return body as T;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** PUT a blob with progress reporting (fetch has no upload progress). */
function putBlob(url: string, blob: Blob, opts: { contentType?: string; signal?: AbortSignal; onProgress?: (loaded: number) => void }) {
  return new Promise<{ etag: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.upload.onprogress = (e) => opts.onProgress?.(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ etag: xhr.getResponseHeader("ETag") });
      else reject(new UploadError(`Storage rejected the upload (HTTP ${xhr.status}).`, xhr.status >= 500 || xhr.status === 429 || xhr.status === 403));
    };
    xhr.onerror = () => reject(new UploadError("Network error while uploading. Check your connection.", true));
    xhr.ontimeout = () => reject(new UploadError("Upload timed out.", true));
    const abort = () => {
      xhr.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (opts.signal?.aborted) return abort();
    opts.signal?.addEventListener("abort", abort, { once: true });
    xhr.send(blob);
  });
}

export async function sha256OfFile(file: Blob, signal?: AbortSignal, onProgress?: (bytes: number) => void): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const chunk = new Uint8Array(await file.slice(offset, offset + HASH_CHUNK).arrayBuffer());
    hasher.update(chunk);
    onProgress?.(Math.min(file.size, offset + HASH_CHUNK));
  }
  return hasher.digest("hex");
}

export function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

export async function uploadFile(
  file: File,
  session: UploadSessionInfo,
  opts: { signal?: AbortSignal; onProgress?: (p: UploadProgress) => void } = {},
): Promise<CompleteResult> {
  const { signal, onProgress } = opts;
  const total = file.size;
  const report = (uploadedBytes: number, phase: UploadProgress["phase"] = "uploading") =>
    onProgress?.({ uploadedBytes: Math.min(uploadedBytes, total), totalBytes: total, phase });

  // Hash concurrently with the network transfer.
  const hashPromise = sha256OfFile(file, signal);
  hashPromise.catch(() => undefined);

  if (session.mode === "SINGLE") {
    let url = session.singleUrl;
    for (let attempt = 0; ; attempt++) {
      try {
        if (!url) {
          const res = await api<{ url: string }>(`/api/uploads/${session.sessionId}/parts`, {
            method: "POST",
            body: JSON.stringify({ partNumbers: [1] }),
            signal,
          });
          url = res.url;
        }
        await putBlob(url, file, { contentType: session.mimeType, signal, onProgress: (loaded) => report(loaded) });
        break;
      } catch (err) {
        if (isAbort(err) || attempt >= PART_RETRIES || (err instanceof UploadError && !err.retryable)) throw err;
        url = null; // refresh the presigned URL in case it expired
        await sleep(1000 * 2 ** attempt, signal);
      }
    }
  } else {
    await uploadMultipart(file, session, signal, report);
  }

  report(total, "finalizing");
  const sha256 = await hashPromise;
  return api<CompleteResult>(`/api/uploads/${session.sessionId}/complete`, {
    method: "POST",
    body: JSON.stringify({ sha256 }),
    signal,
  });
}

async function uploadMultipart(
  file: File,
  session: UploadSessionInfo,
  outerSignal: AbortSignal | undefined,
  report: (bytes: number) => void,
) {
  // A fatal error in one part stops the other workers as well.
  const local = new AbortController();
  const signal = local.signal;
  if (outerSignal?.aborted) local.abort();
  outerSignal?.addEventListener("abort", () => local.abort(), { once: true });
  const partSize = session.partSize!;
  const partCount = session.partCount!;

  // Resume: ask R2 (via the server) which parts are already stored.
  const status = await api<{ uploadedParts: { partNumber: number; size: number }[] }>(`/api/uploads/${session.sessionId}`, { signal });
  const expectedSize = (n: number) => (n === partCount ? file.size - partSize * (partCount - 1) : partSize);
  const done = new Set(status.uploadedParts.filter((p) => p.size === expectedSize(p.partNumber)).map((p) => p.partNumber));
  const inFlight = new Map<number, number>();
  let completedBytes = [...done].reduce((sum, n) => sum + expectedSize(n), 0);
  const emit = () => report(completedBytes + [...inFlight.values()].reduce((a, b) => a + b, 0));
  emit();

  const queue: number[] = [];
  for (let n = 1; n <= partCount; n++) if (!done.has(n)) queue.push(n);
  const urls = new Map<number, string>();

  const fetchUrls = async (numbers: number[]) => {
    const res = await api<{ parts: { partNumber: number; url: string }[] }>(`/api/uploads/${session.sessionId}/parts`, {
      method: "POST",
      body: JSON.stringify({ partNumbers: numbers }),
      signal,
    });
    for (const p of res.parts) urls.set(p.partNumber, p.url);
  };

  const uploadPart = async (n: number) => {
    const start = (n - 1) * partSize;
    const blob = file.slice(start, Math.min(file.size, start + partSize));
    for (let attempt = 0; ; attempt++) {
      try {
        if (!urls.has(n)) {
          const upcoming = queue.slice(0, URL_BATCH - 1).filter((q) => !urls.has(q));
          await fetchUrls([n, ...upcoming]);
        }
        inFlight.set(n, 0);
        await putBlob(urls.get(n)!, blob, {
          signal,
          onProgress: (loaded) => {
            inFlight.set(n, loaded);
            emit();
          },
        });
        inFlight.delete(n);
        completedBytes += blob.size;
        emit();
        return;
      } catch (err) {
        inFlight.delete(n);
        emit();
        if (isAbort(err) || attempt >= PART_RETRIES || (err instanceof UploadError && !err.retryable)) throw err;
        urls.delete(n); // presigned URLs may have expired; re-sign on retry
        await sleep(Math.min(15_000, 800 * 2 ** attempt) + Math.random() * 400, signal);
      }
    }
  };

  let failure: unknown = null;
  const workers = Array.from({ length: Math.min(PART_CONCURRENCY, queue.length) }, async () => {
    while (queue.length && !failure) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const n = queue.shift()!;
      try {
        await uploadPart(n);
      } catch (err) {
        failure ??= err;
        local.abort();
        throw err;
      }
    }
  });
  const results = await Promise.allSettled(workers);
  if (failure) throw outerSignal?.aborted ? new DOMException("Aborted", "AbortError") : failure;
  const rejected = results.find((r) => r.status === "rejected");
  if (rejected && rejected.status === "rejected") throw rejected.reason;
}

export async function cancelUpload(sessionId: string) {
  await fetch(`/api/uploads/${sessionId}`, { method: "DELETE" }).catch(() => undefined);
}

export function fileFingerprint(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
