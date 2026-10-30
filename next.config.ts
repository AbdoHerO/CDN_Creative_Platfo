import { config as loadEnvFile } from "dotenv";
import type { NextConfig } from "next";

// Same rule as src/lib/load-env.ts, kept inline because production images copy
// next.config.ts without src/: .env.prod when NODE_ENV=production, .env.dev
// otherwise, ENV_FILE to override; variables already set always win.
loadEnvFile({
  path: process.env.ENV_FILE?.trim() || (process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev"),
  quiet: true,
});

const nextConfig: NextConfig = {
  // Every screen is authenticated and permission-scoped per user, so pages are
  // rendered dynamically on each request. Cache Components / PPR would add
  // Suspense-boundary constraints without a meaningful static shell to serve.
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  output: "standalone",
  // Native / binary-heavy modules stay outside the server bundle.
  serverExternalPackages: ["sharp", "@node-rs/argon2", "pg", "yauzl", "yazl", "file-type"],
  experimental: {
    serverActions: {
      // Application logo uploads go through a server action.
      bodySizeLimit: "3mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
