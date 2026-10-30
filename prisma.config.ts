import { config as loadEnvFile } from "dotenv";
import { defineConfig } from "prisma/config";

// Self-contained (no imports from src/) because Docker stages copy this file on
// its own. Same rule as src/lib/load-env.ts: .env.prod when NODE_ENV=production,
// .env.dev otherwise, ENV_FILE to override; variables already set always win.
loadEnvFile({
  path: process.env.ENV_FILE?.trim() || (process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev"),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // `prisma generate` (npm postinstall, Docker builds) needs no database; migrate and seed use the real URL.
    url: process.env.DATABASE_URL ?? "postgresql://DATABASE_URL-not-set@localhost:5432/missing",
  },
});
