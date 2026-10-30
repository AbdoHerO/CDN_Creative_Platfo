/**
 * Configure the bucket for direct browser uploads: `npm run storage:setup`.
 *
 * Applies the CORS policy required for presigned PUT uploads from the web app
 * (and exposes the ETag header multipart uploads need). With `--create`, also
 * creates the bucket when it does not exist (useful for local S3 emulators;
 * on Cloudflare you may prefer creating the bucket in the dashboard).
 */
import "dotenv/config";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv, getStorageConfig } from "../src/lib/env";

async function main() {
  const config = getStorageConfig();
  if (!config) {
    console.error("Storage is not configured. Set R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.");
    process.exit(1);
  }
  const s3 = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
    console.log(`✔ Bucket "${config.bucket}" is reachable`);
  } catch {
    if (!process.argv.includes("--create")) {
      console.error(`Bucket "${config.bucket}" not found. Create it in Cloudflare or re-run with --create.`);
      process.exit(1);
    }
    await s3.send(new CreateBucketCommand({ Bucket: config.bucket }));
    console.log(`✔ Bucket "${config.bucket}" created`);
  }

  const origins = [getEnv().APP_URL, ...(process.env.STORAGE_CORS_EXTRA_ORIGINS ?? "").split(",")]
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
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
  console.log(`✔ CORS configured for: ${origins.join(", ")}`);
  console.log("  The bucket stays private: browsers only ever receive short-lived presigned URLs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
