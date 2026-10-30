# Creative Hub — Creative Management Platform (CMP)

Centralised management of marketing creatives for **Win+Pharma, iCoral, Pharmalien and WinMed** (and any application added later): upload originals at full quality to Cloudflare R2, link full and `_preview` versions automatically, preview videos/images/PDFs in the browser, move every creative through a validation workflow, and track everything in an audit log.

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
6. [Cloudflare R2 setup](#cloudflare-r2-setup)
7. [Roles and permissions](#roles-and-permissions)
8. [Testing](#testing)
9. [Production deployment](#production-deployment)
10. [Operations](#operations)
11. [Known limitations](#known-limitations)

## Features

| Area | What it does |
|---|---|
| **Creative library** | Grid and list views, global ⌘K search, combinable filters (application, campaign, type, category, status, tag, uploader, format, date range), six sort orders, URL-driven pagination. |
| **Quality preservation** | Browsers upload **directly to R2** through presigned URLs; originals are never compressed, resized or re-encoded. A SHA-256 computed in the browser is re-verified by the worker against the stored object. Thumbnails and display renditions are separate objects. |
| **Large uploads** | Drag-and-drop, multiple files, multipart uploads (parallel parts, retries with backoff), cancellation, resume after interruption (re-select the same file), per-file progress and speed, size/type validation, and magic-byte content checks. |
| **Full / preview versions** | Files ending in `_preview` are detected automatically and linked to the same creative as their full version. A preview uploaded first is kept as an *unmatched preview* and linked when the full version arrives. Ambiguous matches always require a user decision. Previews are hidden from the library by default (“Show preview versions” toggle). |
| **Version management** | Any number of full / preview / variant versions per creative, a current version per type, version history, per-version preview and download, “make current”, move/link files between creatives. |
| **ZIP import** | Archives are inspected safely on the server (path traversal, absolute paths, symlinks, encrypted entries, zip bombs, content checks), folders suggest application and campaign, and nothing is imported before the user reviews and confirms. |
| **Validation workflow** | `DRAFT → PENDING → IN_REVIEW → APPROVED / DECLINED` (+ request changes, withdraw, reopen, archive, restore). Decline requires a reason; every transition is recorded with reviewer, time, comment and the version reviewed. |
| **Applications & campaigns** | Admins add applications without code changes (logo, brand colour, status). Campaigns group creatives with dates, status and tags. |
| **Team & permissions** | Admin / Manager / Creator / Viewer roles enforced server-side, optional per-application access, temporary passwords, account disable with instant session revocation. |
| **Dashboard, activity, notifications, storage** | Live statistics from the database, searchable/exportable audit log, in-app notifications, storage analytics and R2 reconciliation. |

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), **React 19**, **TypeScript**
- **Tailwind CSS v4**, **shadcn/ui** (Radix), Lucide icons, React Hook Form + **Zod**
- **PostgreSQL 14+** with **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Cloudflare R2** via the S3 API (`@aws-sdk/client-s3`, presigned URLs)
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

**Prerequisites:** Node.js ≥ 20.9 (22 recommended), PostgreSQL ≥ 14, `ffmpeg`/`ffprobe`, `poppler-utils`, and either Cloudflare R2 credentials or a local S3-compatible server (MinIO via `docker compose --profile local-storage up -d minio`, or `pip install "moto[server,s3]" && moto_server -p 9000`).

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL`, `APP_URL`, the `R2_*` variables, and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

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

All configuration comes from environment variables (documented in [`.env.example`](.env.example)). Secrets are only read on the server and never sent to the browser.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `APP_URL` | ✅ | Public URL of the app (origin checks, bucket CORS) |
| `TRUST_PROXY` | | `true` behind a reverse proxy/load balancer so client IPs (audit log, IP rate limit) come from `X-Forwarded-For` / `CF-Connecting-IP` |
| `SESSION_TTL_DAYS` | | Sliding session lifetime (default 7) |
| `R2_ACCOUNT_ID` | ✅* | Cloudflare account id (builds the endpoint) |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | ✅ | R2 API token (Object Read & Write on the bucket) |
| `R2_BUCKET` | ✅ | Bucket name |
| `R2_ENDPOINT` | | Endpoint override (EU jurisdiction, or a local S3 emulator). *Replaces `R2_ACCOUNT_ID` |
| `R2_REGION`, `R2_FORCE_PATH_STYLE` | | Defaults `auto`, `true` |
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

## Cloudflare R2 setup

1. **Create a bucket** in the Cloudflare dashboard (R2 → Create bucket). Keep it **private**: do not enable public access or an `r2.dev` URL.
2. **Create an API token** (R2 → Manage API tokens) with **Object Read & Write** limited to this bucket. Copy the Access Key ID, Secret Access Key, and your Account ID into `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, and set `R2_BUCKET`.
3. **Apply CORS** so browsers can upload directly and read `ETag` headers for multipart uploads: run `npm run storage:setup` (uses `APP_URL`). The equivalent manual rule is: allowed origins = your app URL; methods `GET, PUT, HEAD`; allowed headers `content-type, content-length, range`; expose headers `ETag, Content-Length, Content-Range, Accept-Ranges`.
4. Lifecycle: the worker aborts abandoned multipart uploads itself; you may additionally add an R2 lifecycle rule to abort incomplete multipart uploads after 7 days.

**How it is used:** the server creates single or multipart uploads and signs one part URL at a time; the browser PUTs bytes straight to R2. On completion the server checks the stored size and magic bytes, then registers the version. Reads use short-lived presigned GET URLs (`Content-Disposition` carries the original filename for downloads). Credentials never reach the browser; the bucket is never publicly writable. R2 has no egress fees, and storage is billed per GB-month (cost estimate on the Storage page).

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

Runs **unit tests** (filename/preview parsing, association planner, workflow, permissions, ZIP safety, content sniffing) and **integration tests** against a real PostgreSQL database and an S3-compatible endpoint. Defaults: database `cmp_test` on localhost, S3 on `http://127.0.0.1:9000`; override with `TEST_DATABASE_URL`, `TEST_R2_ENDPOINT`, `TEST_R2_ACCESS_KEY_ID`, `TEST_R2_SECRET_ACCESS_KEY`, `TEST_R2_BUCKET`. Migrations are applied automatically. **Never point the test variables at production**: the integration suite truncates its database.

```bash
npm run test:e2e
```

Runs Playwright against a running app (default `http://localhost:3000`, or `E2E_BASE_URL`) with the worker running and demo users seeded. CI (`.github/workflows/ci.yml`) runs lint, typecheck, audit, unit, integration, build, and E2E.

## Production deployment

The platform consists of **two processes** sharing one database and one bucket: the **web app** (stateless, scale horizontally) and the **worker** (scale by adding replicas; jobs are claimed with `FOR UPDATE SKIP LOCKED`, and maintenance is guarded by an advisory lock).

### Docker (single server or any container platform)

```bash
cp .env.example .env
```

```bash
docker compose up -d db
```

```bash
docker compose run --rm migrate
```

```bash
docker compose up -d web worker
```

Images: `docker build --target web .` (Next.js standalone server, healthcheck on `/api/health`) and `docker build --target worker .` (includes ffmpeg and poppler; also runs migrations and the seed). Put the web container behind HTTPS (Caddy, Nginx, Traefik, Cloudflare) and set `TRUST_PROXY=true`.

### Managed platforms

- **Web:** any Node.js host (Vercel, Railway, Render, Fly.io, ECS, Kubernetes). Build `npm run build`, start `npm run start` (or the standalone `server.js`).
- **Worker:** a long-running process with ffmpeg and poppler installed (`npm run worker`). Serverless functions are not suitable for it.
- **Database:** managed PostgreSQL (Neon, Supabase, RDS, Cloud SQL). The `pg_trgm` extension must be available (it is on all major providers).
- Run `npm run db:migrate` on every deploy before starting the new version.

### Release checklist

1. Set `APP_URL` to the public HTTPS URL, `NODE_ENV=production`, and the real R2 credentials.
2. `npm run db:migrate`, then `npm run db:seed` once to create roles, applications and the first admin.
3. `npm run storage:setup` against the production bucket.
4. Start web and worker; open **Settings → System status** to confirm storage and worker health.
5. Sign in, change the admin password, then create users from **Team & Users**.

## Operations

- **Backups:** back up PostgreSQL (point-in-time recovery recommended). R2 objects are durable; enable R2 bucket versioning or replicate the bucket if you need protection against accidental deletion.
- **Health:** `/api/health` (database + storage configuration). **Settings → System status** shows queue depth, failed jobs and a stalled-worker warning.
- **Reconciliation:** **Storage → Reconcile with R2** compares bucket objects with database records (orphans and missing objects).
- **Housekeeping (automatic):** expired sessions and rate-limit windows, abandoned uploads (multipart aborted), empty creatives from failed batches, old completed jobs.
- **Scaling:** files never pass through the web servers; worker temp disk must fit the largest file being processed.

## Known limitations

- Cloudflare R2 itself was not available in the build environment. The storage integration was exercised end-to-end against an S3-compatible server (presigned single and multipart PUTs, CORS, ranged GETs, listing, deletion). Run `npm run storage:setup` and the E2E suite against your R2 bucket before go-live.
- Browser playback depends on the codec: MP4/H.264, WebM and most MOV files play inline; MKV/AVI and unusual codecs fall back to download (or the `_preview` version).
- No outbound email: notifications are in-app, and temporary passwords are shown once to the admin to share securely.
- The `shadcn` CLI (a development dependency) carries 3 low-severity advisories in `deepmerge`; production dependencies audit clean.
