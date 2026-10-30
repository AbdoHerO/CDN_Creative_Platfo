import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is authenticated and permission-scoped per user, so pages are
  // rendered dynamically on each request. Cache Components / PPR would add
  // Suspense-boundary constraints without a meaningful static shell to serve.
  cacheComponents: false,
  partialPrefetching: false,
  poweredByHeader: false,
  output: "standalone",
  // Native / binary-heavy modules stay outside the server bundle.
  serverExternalPackages: ["sharp", "@node-rs/argon2", "pg", "yauzl", "file-type"],
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
