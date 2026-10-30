/**
 * Integration tests run against real services: a dedicated PostgreSQL database
 * and an S3-compatible endpoint (a RustFS test bucket, or a local emulator such
 * as moto). Override with TEST_* variables. Never point them at production.
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://cmp:cmp_dev_password@127.0.0.1:5432/cmp_test?schema=public",
  APP_URL: "http://localhost:3000",
  URL_RUSTFS: process.env.TEST_URL_RUSTFS ?? "http://127.0.0.1:9000",
  ACCESS_KEY: process.env.TEST_ACCESS_KEY ?? "test",
  SECRET_KEY: process.env.TEST_SECRET_KEY ?? "test",
  BUCKET_NAME: process.env.TEST_BUCKET_NAME ?? "cmp-test",
  // Small parts keep multipart tests fast (the S3 minimum part size is 5 MiB).
  UPLOAD_PART_SIZE_MB: "5",
  UPLOAD_MULTIPART_THRESHOLD_MB: "6",
  UPLOAD_MAX_FILE_SIZE_MB: "200",
};
