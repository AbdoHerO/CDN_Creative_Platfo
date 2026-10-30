/**
 * Integration tests run against real services: a dedicated PostgreSQL database
 * and an S3-compatible endpoint (Cloudflare R2 in production; MinIO, moto or a
 * dedicated R2 bucket for tests). Override with TEST_* variables.
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://cmp:cmp_dev_password@127.0.0.1:5432/cmp_test?schema=public",
  APP_URL: "http://localhost:3000",
  R2_ENDPOINT: process.env.TEST_R2_ENDPOINT ?? "http://127.0.0.1:9000",
  R2_ACCOUNT_ID: "test",
  R2_ACCESS_KEY_ID: process.env.TEST_R2_ACCESS_KEY_ID ?? "test",
  R2_SECRET_ACCESS_KEY: process.env.TEST_R2_SECRET_ACCESS_KEY ?? "test",
  R2_BUCKET: process.env.TEST_R2_BUCKET ?? "cmp-test",
  // Small parts keep multipart tests fast (R2/S3 minimum part size is 5 MiB).
  UPLOAD_PART_SIZE_MB: "5",
  UPLOAD_MULTIPART_THRESHOLD_MB: "6",
  UPLOAD_MAX_FILE_SIZE_MB: "200",
};
