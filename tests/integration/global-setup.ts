import { execSync } from "node:child_process";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { TEST_ENV } from "./test-env";

/** Apply migrations to the test database and make sure the test bucket exists. */
export default async function setup() {
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...TEST_ENV }, stdio: "pipe" });

  const s3 = new S3Client({
    region: "us-east-1",
    endpoint: TEST_ENV.URL_RUSTFS,
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_ENV.ACCESS_KEY, secretAccessKey: TEST_ENV.SECRET_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: TEST_ENV.BUCKET_NAME }));
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === undefined) {
      throw new Error(`Integration tests need an S3-compatible endpoint at ${TEST_ENV.URL_RUSTFS} (set TEST_URL_RUSTFS). ${err}`);
    }
    await s3.send(new CreateBucketCommand({ Bucket: TEST_ENV.BUCKET_NAME }));
  }
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: TEST_ENV.BUCKET_NAME,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: ["*"], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"] }] },
    }),
  );
}
