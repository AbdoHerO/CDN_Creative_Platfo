import { execSync } from "node:child_process";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { TEST_ENV } from "./test-env";

/** Apply migrations to the test database and make sure the test bucket exists. */
export default async function setup() {
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...TEST_ENV }, stdio: "pipe" });

  const s3 = new S3Client({
    region: "auto",
    endpoint: TEST_ENV.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: TEST_ENV.R2_ACCESS_KEY_ID, secretAccessKey: TEST_ENV.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: TEST_ENV.R2_BUCKET }));
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === undefined) {
      throw new Error(`Integration tests need an S3-compatible endpoint at ${TEST_ENV.R2_ENDPOINT} (set TEST_R2_ENDPOINT). ${err}`);
    }
    await s3.send(new CreateBucketCommand({ Bucket: TEST_ENV.R2_BUCKET }));
  }
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: TEST_ENV.R2_BUCKET,
      CORSConfiguration: { CORSRules: [{ AllowedOrigins: ["*"], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"] }] },
    }),
  );
}
