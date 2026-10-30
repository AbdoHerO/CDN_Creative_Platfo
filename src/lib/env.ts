import { z } from "zod";

/**
 * Server environment, validated once on first access.
 *
 * Validation is lazy so `next build` does not require runtime secrets. Storage
 * variables are optional: when missing, storage features report themselves as
 * "not configured" instead of pretending to work.
 */

const boolish = z
  .enum(["true", "false", "1", "0", "yes", "no", ""])
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : ["true", "1", "yes"].includes(v)));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  TRUST_PROXY: boolish,

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,
  /** Override for the S3 endpoint. Defaults to https://<account>.r2.cloudflarestorage.com */
  R2_ENDPOINT: optionalString,
  R2_REGION: z.string().default("auto"),
  R2_FORCE_PATH_STYLE: boolish,

  UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).default(20480),
  UPLOAD_PART_SIZE_MB: z.coerce.number().int().min(5).max(512).default(16),
  UPLOAD_MULTIPART_THRESHOLD_MB: z.coerce.number().int().min(5).default(32),
  UPLOAD_SESSION_TTL_HOURS: z.coerce.number().int().min(1).default(48),

  ZIP_MAX_ENTRIES: z.coerce.number().int().min(1).default(5000),
  ZIP_MAX_UNCOMPRESSED_MB: z.coerce.number().int().min(1).default(102400),
  ZIP_MAX_COMPRESSION_RATIO: z.coerce.number().min(1).default(200),

  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(14400),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(86400).default(300),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  WORKER_TMP_DIR: optionalString,
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  PDFTOPPM_PATH: z.string().default("pdftoppm"),
  PDFINFO_PATH: z.string().default("pdfinfo"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Reset the memoised env (tests only). */
export function resetEnvCache() {
  cached = null;
}

export type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export function getStorageConfig(): StorageConfig | null {
  const env = getEnv();
  const endpoint =
    env.R2_ENDPOINT ?? (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint || !env.R2_BUCKET || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: env.R2_REGION,
    bucket: env.R2_BUCKET,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    forcePathStyle: env.R2_FORCE_PATH_STYLE ?? true,
  };
}

export function isStorageConfigured(): boolean {
  return getStorageConfig() !== null;
}

export const MB = 1024 * 1024;
