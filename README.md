# Creative Hub — Creative Management Platform (CMP)

Centralised management of marketing creatives for **Win+Pharma, iCoral, Pharmalien and WinMed** (and any application added later): upload originals at full quality to self-hosted RustFS (S3-compatible) storage, link full and `_preview` versions automatically, preview videos/images/PDFs in the browser, move every creative through a validation workflow, and track everything in an audit log.

- **Complete documentation (features, user guide, how it works, setup, deployment, operations):** [`docs/DOCUMENTATION.md`](docs/DOCUMENTATION.md)
- **Architecture, data model and design decisions:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Requirements checklist and test results:** [`docs/CHECKLIST.md`](docs/CHECKLIST.md)

> **Branch policy:** all development happens on `main`. Do not create or push to other branches. See [Development workflow](docs/DOCUMENTATION.md#17-development-workflow).

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Running locally](#running-locally)
5. [Environment variables](#environment-variables)
6. [RustFS storage setup](#rustfs-storage-setup)
7. [Roles and permissions](#roles-and-permissions)
8. [Testing](#testing)
9. [Production deployment](#production-deployment)
10. [Operations](#operations)
11. [Known limitations](#known-limitations)

## Features

| Area | What it does |
|---|---|
| **Creative library** | Reels-style grid (tall cards, muted hover preview of the lite version) and list views, a filter banner (platforms, approved / not yet / declined, with or without preview, live counts), global ⌘K search, combinable filters (application, campaign, type, category, badge, status, tag, uploader, format, date range), six sort orders, URL-driven pagination. |
| **Quality preservation** | Browsers upload **directly to RustFS** through presigned S3 URLs; originals are never compressed, resized or re-encoded. A SHA-256 computed in the browser is re-verified by the worker against the stored object. Thumbnails and display renditions are separate objects. |
| **Large uploads** | Drag-and-drop, multiple files, multipart uploads (parallel parts, retries with backoff), cancellation, resume after interruption (re-select the same file), per-file progress and speed, size/type validation, and magic-byte content checks. |
| **Full / preview versions** | Files named `…_preview` / `…-preview` (the lite version of a video) are detected automatically, also when the full file is named `…_reel` or `…_final`, and linked to the same creative as their full version. A preview uploaded first is kept as an *unmatched preview* and linked when the full version arrives. Ambiguous matches always require a user decision. Previews are hidden from the library by default (“Show preview versions” toggle). |
| **Version management** | Any number of full / preview / variant versions per creative, a current version per type, version history, per-version preview and download, “make current”, move/link files between creatives, and **Replace file** (after a warning, the old file is deleted from storage and the space freed). |
| **Badges** | Coloured labels such as Motion graphique, Higgsfield, 3D or Sans miniature on every card and creative page, switched on with one click, filterable, managed in Settings and added automatically on import when the name is part of the file name. |
| **ZIP import** | Zip a `data_creatives/<platform>/{banners,videos}` folder (a template ZIP can be downloaded). Archives are inspected safely on the server (path traversal, absolute paths, symlinks, encrypted entries, zip bombs, content checks); platform folders map to applications and unknown ones become new platforms (admins); every import adds new creatives, renaming duplicates `(2)`; nothing is imported before the user reviews and confirms. |
| **Validation workflow** | `DRAFT → PENDING → IN_REVIEW → APPROVED / DECLINED` (+ request changes, withdraw, reopen, archive, restore). Decline requires a reason; every transition is recorded with reviewer, time, comment and the version reviewed. |
| **Applications & campaigns** | Admins add applications without code changes (logo, brand colour, status). Campaigns group creatives with dates, status and tags. |
| **Team & permissions** | Admin / Manager / Creator / Viewer roles enforced server-side, optional per-application access, temporary passwords, account disable with instant session revocation. |
| **Dashboard, activity, notifications, storage** | Live statistics from the database, searchable/exportable audit log, in-app notifications, storage analytics and bucket reconciliation. |

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), **React 19**, **TypeScript**
- **Tailwind CSS v4**, **shadcn/ui** (Radix), Lucide icons, React Hook Form + **Zod**
- **PostgreSQL 14+** with **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **RustFS** (self-hosted, S3-compatible) via the S3 API (`@aws-sdk/client-s3`, presigned URLs)
- Background worker: Postgres-backed job queue, **ffmpeg/ffprobe**, **sharp**, **poppler** (`pdftoppm`, `pdfinfo`), **yauzl**
- Auth: database sessions (SHA-256-hashed tokens, httpOnly cookies), **argon2id** passwords
- Tests: **Vitest** (unit + integration against real services), **Playwright** (E2E)

## Project structure

```
prisma/                 schema.prisma, migrations/, seed.ts
scripts/                storage-setup.ts (bucket CORS), demo-media.ts (dev sample data)
src/
  app/
    (auth)/             login, change-password
    (app)/              dashboard, library, creatives/[id], upload, imports/[id],
                        applications, campaigns, validation, approved, declined,
                        archived, team, activity, notifications, storage,
                        settings, profile
    api/                uploads (plan/batch/parts/complete/abort), imports,
                        files/[id]/download|preview, search, notifications,
                        creatives/lookup, activity/export, health
  components/           ui/ (shadcn), layout/, library/, creatives/, upload/, …
  lib/                  env, db, auth/, permissions, workflow, files/ (types,
                        naming, matching), storage/ (r2, keys), zip/safety, …
  server/
    actions/            server actions (auth, creatives, applications, …)
    services/           uploads, creatives (versions), validation (workflow)
    queries/            library, creative detail, dashboard, activity, …
  worker/               index.ts (queue runner), handlers/, media.ts, zip.ts
  proxy.ts              CSP nonce, security headers, auth redirect
tests/unit, tests/integration, e2e/
```

## Running locally

**Prerequisites:** Node.js ≥ 20.9 (22 recommended), PostgreSQL ≥ 14, `ffmpeg`/`ffprobe`, `poppler-utils`, and a RustFS server with a bucket and an access key (any S3-compatible server works for development, for example `pip install "moto[server,s3]" && moto_server -p 9000`).

```bash
npm install
```

```bash
cp .env.dev.example .env.dev
```

Edit `.env.dev`: set `DATABASE_URL`, `APP_URL`, the RustFS variables (`URL_RUSTFS`, `BUCKET_NAME`, `ACCESS_KEY`, `SECRET_KEY`) and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Development commands load `.env.dev`; production (`NODE_ENV=production`) loads `.env.prod` (see [Environment variables](#environment-variables)).

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run storage:setup -- --create
```

Run the web app and the worker in two terminals:

```bash
npm run dev
```

```bash
npm run worker
```

Open http://localhost:3000 and sign in with the seeded admin. Optional, development only: set `SEED_DEMO_USERS=true` before seeding to get one user per role (password `Demo-Password-2026` unless `SEED_DEMO_PASSWORD` is set), then generate real sample media through the real pipeline:

```bash
npm run demo:media
```

### Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server / production build / production server |
| `npm run worker` | Background worker (required for thumbnails, metadata, checksum verification, ZIP import, deletions) |
| `npm run db:migrate` / `db:migrate:dev` / `db:seed` / `db:studio` | Prisma migrations, seed, Prisma Studio |
| `npm run storage:setup [-- --create]` | Apply the bucket CORS policy (and create the bucket) |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` / `npm run test:e2e` | Vitest unit + integration / Playwright E2E |

## Environment variables

All configuration comes from environment variables, loaded by `src/lib/load-env.ts` from **`.env.dev`** (development: `npm run dev`, `npm run worker`, scripts, Prisma) or **`.env.prod`** (whenever `NODE_ENV=production`: `npm run build`, `npm run start`, Docker). `ENV_FILE=<file>` picks another file, and variables already set in the real environment always win. Both files are git-ignored; the templates [`.env.dev.example`](.env.dev.example) and [`.env.prod.example`](.env.prod.example) are committed. Secrets are only read on the server and never sent to the browser.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `APP_URL` | ✅ | Public URL of the app (origin checks, bucket CORS) |
| `TRUST_PROXY` | | `true` behind a reverse proxy/load balancer so client IPs (audit log, IP rate limit) come from `X-Real-IP` / `X-Forwarded-For` |
| `SESSION_TTL_DAYS` | | Sliding session lifetime (default 7) |
| `URL_RUSTFS` | ✅ | S3 API endpoint of the RustFS server, e.g. `https://files.example.com` (must be reachable from browsers) |
| `BUCKET_NAME` | ✅ | Bucket name |
| `ACCESS_KEY`, `SECRET_KEY` | ✅ | RustFS access key with read & write on the bucket |
| `S3_REGION` | | Signing region, must match the server's `RUSTFS_REGION` (default `us-east-1`) |
| `STORAGE_CORS_EXTRA_ORIGINS` | | Extra origins for `storage:setup` |
| `UPLOAD_MAX_FILE_SIZE_MB` | | Hard per-file limit (default 20480); admins can lower it in Settings |
| `UPLOAD_PART_SIZE_MB`, `UPLOAD_MULTIPART_THRESHOLD_MB` | | Multipart tuning (defaults 16 / 32) |
| `UPLOAD_SESSION_TTL_HOURS` | | Abandoned uploads are aborted after this (default 48) |
| `ZIP_MAX_ENTRIES`, `ZIP_MAX_UNCOMPRESSED_MB`, `ZIP_MAX_COMPRESSION_RATIO` | | ZIP import limits (5000 / 102400 / 200) |
| `SIGNED_URL_TTL_SECONDS`, `DOWNLOAD_URL_TTL_SECONDS` | | Preview / download URL lifetimes (14400 / 300) |
| `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL_MS`, `WORKER_TMP_DIR` | | Worker tuning; the temp dir needs room for the largest file |
| `FFMPEG_PATH`, `FFPROBE_PATH`, `PDFTOPPM_PATH`, `PDFINFO_PATH` | | Tool locations (default: on `PATH`) |
| `DATABASE_POOL_SIZE` | | Connections per process (default 10) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | | First admin (a temporary password is generated if empty) |
| `SEED_DEMO_USERS`, `SEED_DEMO_PASSWORD` | | Development-only demo users and campaigns (refused in production) |

When storage variables are missing, the app runs but clearly reports “File storage is not configured” and disables uploads. It never pretends storage works.

## RustFS storage setup

1. **Create a bucket** in the RustFS console (or with `npm run storage:setup -- --create`). Keep it **private**: no anonymous or public bucket policy.
2. **Create an access key** with read & write access to that bucket and put it in `ACCESS_KEY` / `SECRET_KEY`. Set `URL_RUSTFS` to the S3 API endpoint and `BUCKET_NAME` to the bucket. Buckets are addressed path-style (`https://host/bucket/key`).
3. **Apply CORS** so browsers can upload directly and read `ETag` headers for multipart uploads: run `npm run storage:setup` (uses `APP_URL` plus `STORAGE_CORS_EXTRA_ORIGINS`). The equivalent manual rule is: allowed origins = your app URL; methods `GET, PUT, HEAD`; allowed headers `content-type, content-length, range`; expose headers `ETag, Content-Length, Content-Range, Accept-Ranges`. If the server refuses bucket CORS, allow the origin on the server with `RUSTFS_CORS_ALLOWED_ORIGINS`.
4. Lifecycle: the worker aborts abandoned multipart uploads itself.

**How it is used:** the server creates single or multipart uploads and signs one part URL at a time; the browser PUTs bytes straight to RustFS. On completion the server checks the stored size and magic bytes, then registers the version. Reads use short-lived presigned GET URLs (`Content-Disposition` carries the original filename for downloads). Credentials never reach the browser; the bucket is never publicly writable. Because browsers talk to `URL_RUSTFS` directly, publish it over HTTPS on a host users can reach. The Storage page estimates cost from your own price per GB-month (Settings).

## Roles and permissions

All checks run on the server (`src/lib/permissions.ts`, `src/lib/visibility.ts`); the UI only hides what the server would refuse anyway.

| Capability | Admin | Manager | Creator | Viewer |
|---|:-:|:-:|:-:|:-:|
| Browse & download | all | all | approved/pending + own drafts | approved only |
| Upload, ZIP import | ✅ | ✅ | ✅ | — |
| Edit metadata / add versions | all | all (not archived) | own drafts & declined | — |
| Submit for validation | ✅ | ✅ | own | — |
| Review, approve, decline, request changes | ✅ | ✅ | — | — |
| Archive / restore | ✅ | ✅ | archive own drafts | — |
| Delete creatives | ✅ | — | own never-submitted drafts | — |
| Campaigns | ✅ | ✅ | — | — |
| Applications, users, settings | ✅ | — | — | — |
| Activity history, storage analytics | ✅ | ✅ | — | — |

Any user can additionally be restricted to specific applications.

## Testing

```bash
npm test
```

Runs **unit tests** (filename/preview parsing, association planner, workflow, permissions, ZIP safety, content sniffing) and **integration tests** against a real PostgreSQL database and an S3-compatible endpoint. Defaults: database `cmp_test` on localhost, S3 on `http://127.0.0.1:9000`; override with `TEST_DATABASE_URL`, `TEST_URL_RUSTFS`, `TEST_ACCESS_KEY`, `TEST_SECRET_KEY`, `TEST_BUCKET_NAME`. Migrations are applied automatically. **Never point the test variables at production**: the integration suite truncates its database.

```bash
npm run test:e2e
```

Runs Playwright against a running app (default `http://localhost:3000`, or `E2E_BASE_URL`) with the worker running and demo users seeded (set `E2E_ADMIN_PASSWORD` to your seeded admin password; the default is CI's). CI (`.github/workflows/ci.yml`) runs lint, typecheck, audit, unit, integration, build, and E2E.

## Production deployment

The platform consists of **two processes** sharing one database and one bucket: the **web app** (stateless, scale horizontally) and the **worker** (scale by adding replicas; jobs are claimed with `FOR UPDATE SKIP LOCKED`, and maintenance is guarded by an advisory lock).

### Docker (single server or any container platform)

```bash
cp .env.prod.example .env.prod
```

```bash
docker compose --env-file .env.prod up -d db
```

```bash
docker compose --env-file .env.prod run --rm migrate
```

```bash
docker compose --env-file .env.prod up -d web worker
```

Every service reads `.env.prod`. To run RustFS on the same server, start the bundled service with `docker compose --env-file .env.prod --profile rustfs up -d rustfs` (it uses `ACCESS_KEY` / `SECRET_KEY` as its root credentials).

Images: `docker build --target web .` (Next.js standalone server, healthcheck on `/api/health`) and `docker build --target worker .` (includes ffmpeg and poppler; also runs migrations and the seed). Put the web container behind HTTPS (Caddy, Nginx, Traefik) and set `TRUST_PROXY=true`.

### Managed platforms

- **Web:** any Node.js host (Vercel, Railway, Render, Fly.io, ECS, Kubernetes). Build `npm run build`, start `npm run start` (or the standalone `server.js`).
- **Worker:** a long-running process with ffmpeg and poppler installed (`npm run worker`). Serverless functions are not suitable for it.
- **Database:** managed PostgreSQL (Neon, Supabase, RDS, Cloud SQL). The `pg_trgm` extension must be available (it is on all major providers).
- Run `npm run db:migrate` on every deploy before starting the new version.

### Release checklist

1. Fill in `.env.prod`: `APP_URL` (public HTTPS URL), `DATABASE_URL`, the RustFS variables and `TRUST_PROXY=true` behind a proxy. `NODE_ENV=production` selects this file.
2. `npm run db:migrate`, then `npm run db:seed` once to create roles, applications and the first admin.
3. `npm run storage:setup` against the production bucket.
4. Start web and worker; open **Settings → System status** to confirm storage and worker health.
5. Sign in, change the admin password, then create users from **Team & Users**.

## Operations

- **Backups:** back up PostgreSQL (point-in-time recovery recommended). Back up RustFS too: run it with erasure coding across several disks or nodes, and enable bucket versioning or replicate the bucket to protect against accidental deletion.
- **Health:** `/api/health` (database + storage configuration). **Settings → System status** shows queue depth, failed jobs and a stalled-worker warning.
- **Reconciliation:** **Storage → Reconcile with storage** compares bucket objects with database records (orphans and missing objects).
- **Housekeeping (automatic):** expired sessions and rate-limit windows, abandoned uploads (multipart aborted), empty creatives from failed batches, old completed jobs.
- **Scaling:** files never pass through the web servers; worker temp disk must fit the largest file being processed.

## Known limitations

- Storage was verified end-to-end against a RustFS server (browser uploads, previews, byte-identical downloads, worker checksums and thumbnails) and, for the integration suite, an S3-compatible emulator. Run `npm run storage:setup` and the E2E suite against the production RustFS bucket before go-live.
- Browser playback depends on the codec: MP4/H.264, WebM and most MOV files play inline; MKV/AVI and unusual codecs fall back to download (or the `_preview` version).
- No outbound email: notifications are in-app, and temporary passwords are shown once to the admin to share securely.
- The `shadcn` CLI (a development dependency) carries 3 low-severity advisories in `deepmerge`; production dependencies audit clean.
