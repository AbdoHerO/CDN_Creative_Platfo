/**
 * Configure the bucket for direct browser uploads: `npm run storage:setup`.
 *
 * Applies the CORS policy required for presigned PUT uploads from the web app
 * (and exposes the ETag header multipart uploads need). With `--create`, also
 * creates the bucket when it does not exist.
 */
import { envFileName } from "../src/lib/load-env";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv, getStorageConfig } from "../src/lib/env";

async function main() {
  const config = getStorageConfig();
  if (!config) {
    console.error(`Storage is not configured. Set URL_RUSTFS, BUCKET_NAME, ACCESS_KEY and SECRET_KEY (in ${envFileName()}).`);
    process.exit(1);
  }
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    console.log(`✔ Bucket "${config.bucket}" is reachable at ${config.endpoint}`);
  } catch {
    if (!process.argv.includes("--create")) {
      console.error(`Bucket "${config.bucket}" not found at ${config.endpoint}. Create it in the RustFS console or re-run with --create.`);
      process.exit(1);
    }
    await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
    console.log(`✔ Bucket "${config.bucket}" created`);
  }

  const origins = [getEnv().APP_URL, ...(process.env.STORAGE_CORS_EXTRA_ORIGINS ?? "").split(",")]
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: config.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["content-type", "content-length", "range"],
              ExposeHeaders: ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  } catch (err) {
    console.error(`Could not set the bucket CORS rule: ${err instanceof Error ? err.message : String(err)}`);
    console.error(
      `Allow these origins on the RustFS server instead (RUSTFS_CORS_ALLOWED_ORIGINS="${origins.join(",")}"), ` +
        "with methods GET, PUT, HEAD and the ETag header exposed.",
    );
    process.exit(1);
  }
  console.log(`✔ CORS configured for: ${origins.join(", ")}`);
  console.log("  The bucket stays private: browsers only ever receive short-lived presigned URLs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
