FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json prisma.config.ts ./
# `npm ci` runs `prisma generate` (postinstall), which needs the schema.
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholder only: the real DATABASE_URL comes from the env file at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# ffmpeg and poppler-utils (pdfinfo/pdftoppm) are used by the worker for video
# metadata and PDF thumbnails.
# postgresql-client provides pg_dump for the in-app database backup feature.
# NOTE: the client major must be >= your Postgres server major. If your server
# is newer than 16, bump this to the matching postgresqlNN-client package.
RUN apk add --no-cache openssl ffmpeg poppler-utils postgresql16-client

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts /app/prisma.config.ts /app/tsconfig.json ./
# Source for the background worker (`npm run worker`, see docker-compose.yml).
COPY --from=builder /app/src ./src

RUN mkdir -p /app/public/uploads/templates
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
