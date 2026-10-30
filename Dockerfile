FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# postgresql-client provides pg_dump for the in-app database backup feature.
# NOTE: the client major must be >= your Postgres server major. If your server
# is newer than 16, bump this to the matching postgresqlNN-client package.
RUN apk add --no-cache openssl ffmpeg postgresql16-client

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /app/public/uploads/templates
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
