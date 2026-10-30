# syntax=docker/dockerfile:1.7
#
# Creative Management Platform
#   docker build --target web    -t cmp-web .
#   docker build --target worker -t cmp-worker .
#
# The web image runs the Next.js standalone server. The worker image contains
# ffmpeg/ffprobe and poppler (pdftoppm/pdfinfo) for metadata and thumbnails and
# is also used to run database migrations and the seed.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY . .
# Build-time placeholders only: real values are provided at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate && npx next build

# ── Web ──────────────────────────────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ── Worker (also runs migrations / seed) ─────────────────────────────────────
FROM base AS worker
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg poppler-utils ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs --create-home worker
COPY --from=build --chown=worker:nodejs /app ./
USER worker
CMD ["npx", "tsx", "src/worker/index.ts"]
