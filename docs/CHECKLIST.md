# Requirements checklist

Status values: **COMPLETED**, **IN PROGRESS**, **NOT STARTED**, **BLOCKED** (genuine external dependency only).
“Verified by” names the automated tests (U = unit, I = integration, E = end-to-end) or the manual check that covers the item.

## Core platform

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 1 | Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Lucide, RHF, Zod | COMPLETED | build, typecheck, lint |
| 2 | PostgreSQL + Prisma schema, migrations, seed (4 applications, roles, admin) | COMPLETED | `prisma migrate deploy`, seed run, I (all suites run on migrated DB) |
| 3 | Secure authentication (argon2id, DB sessions, change-password flow) | COMPLETED | I `auth.test.ts`, E authentication specs |
| 4 | RBAC enforced server-side (Admin/Manager/Creator/Viewer + per-application access) | COMPLETED | U `permissions.test.ts`, I visibility/workflow/upload tests, E role-based access specs |
| 5 | Environment variables for all secrets; no hard-coded config | COMPLETED | `src/lib/env.ts` (Zod), `.env.example` |
| 6 | Collapsible sidebar with all 11 navigation entries; top bar with search, notifications, profile, quick upload | COMPLETED | manual screenshots, E navigation assertions |
| 7 | All 19 required pages (login, dashboard, library, details, upload, applications (+details), campaigns (+details), pending, approved, declined, archived, team, activity, notifications, storage, settings, profile) | COMPLETED | production build route list; page crawl (all 200, no console errors) |

## Library, search and details

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 8 | Grid and list views with thumbnail, name, application, campaign, category, format, date, uploader, status, versions | COMPLETED | manual screenshots |
| 9 | Search by name, filename, application, campaign, category, tags, keywords, status, date, uploader; combinable filters; dynamic updates | COMPLETED | I `library.test.ts`, E global search |
| 10 | Sorting (newest, oldest, alphabetical, updated, largest, smallest) and pagination | COMPLETED | I `library.test.ts` |
| 11 | Details page: large preview, metadata, versions, validation history, actions (preview, download, edit, status, new version, archive, delete) | COMPLETED | E lifecycle spec, manual screenshots |
| 12 | Built-in video player, zoomable image viewer, PDF viewer — no forced download | COMPLETED | E (video element), manual |

## Uploads and storage

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 13 | Originals preserved byte-for-byte (no compression/resize/re-encode) | COMPLETED | I SHA-256 of stored object = original; E downloaded file hash = uploaded file hash |
| 14 | Direct upload to R2; drag-and-drop; multiple files; progress; cancel; retry; resume; multipart; size & type validation | COMPLETED | I multipart + resume + cancel tests; E upload spec |
| 15 | Content validation (magic bytes) | COMPLETED | U sniffing tests; I + E disguised `.mp4` rejected |
| 16 | Checksums for integrity | COMPLETED | I worker verifies SHA-256, mismatch flagged + notified; E "Verified" badge |
| 17 | Thumbnails/previews generated separately via background jobs | COMPLETED | I `worker.test.ts` (separate WebP object, original untouched) |
| 18 | Signed URLs; credentials never exposed; bucket never public | COMPLETED | code review, E download via presigned redirect |
| 19 | Cloudflare R2 live verification | **BLOCKED** (credentials not available in the build environment) | Integration fully implemented and exercised end-to-end against an S3-compatible server. Run `npm run storage:setup` and the E2E suite against the production bucket. |

## Versions and ZIP import

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 20 | `_preview` detection; full + preview linked to the same creative | COMPLETED | U naming/matching; I uploads; E lifecycle |
| 21 | Preview uploaded first kept unmatched and linked later automatically | COMPLETED | U matching; I uploads; manual linking card |
| 22 | Ambiguous matches require a user decision; nothing associated silently | COMPLETED | U matching; manual ZIP review (decision required) |
| 23 | Multiple full/preview/variant versions with all required file metadata | COMPLETED | I `versions.test.ts`, worker metadata tests |
| 24 | "Show preview versions" global filter (off by default; previews labelled when on; accessible on details page) | COMPLETED | I library preview test; E toggle spec |
| 25 | Version selector with separate preview and download per version | COMPLETED | E lifecycle spec |
| 26 | ZIP import: secure extraction, path traversal protection, format detection, `_preview` detection, application/campaign suggestions, review before confirm, upload to R2, optional archive retention | COMPLETED | U ZIP safety; I hostile archive import; manual review UI |

## Workflow, team and management

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 27 | Statuses DRAFT → PENDING → IN_REVIEW → APPROVED/DECLINED, resubmission | COMPLETED | U workflow; I workflow; E lifecycle |
| 28 | Each action records creative, previous/new status, reviewer, timestamp, comment, rejection reason | COMPLETED | I workflow history assertions |
| 29 | Decline requires a reason; approval comment optional; only authorised users validate | COMPLETED | U/I/E |
| 30 | Team & users: create, edit role/access, disable/enable, reset password | COMPLETED | E admin spec |
| 31 | Applications: create/edit/disable, logo, colour, statistics; seeded four | COMPLETED | E admin spec, seed |
| 32 | Campaigns: name, application, description, dates, status, tags, creatives | COMPLETED | E admin spec |
| 33 | Activity history (uploads, deletions, edits, status changes, approvals, rejections, versions, downloads, user changes) — searchable, filterable, exportable | COMPLETED | I activity assertions; E activity log check |
| 34 | Notifications (approved, declined, changes requested, new submission) with read/unread | COMPLETED | I workflow notifications; E notification check |
| 35 | Dashboard with real statistics (totals, by application, by status, recent uploads/approvals/activity, storage, pending overview) | COMPLETED | manual screenshots (values match DB) |
| 36 | Storage management (total, by application, by category, full vs preview, files, creatives) from DB records + R2 reconciliation | COMPLETED | E storage spec; manual |
| 37 | Security: rate limiting, CSRF, CSP, ZIP protection, audit logging | COMPLETED | I rate limit; E cross-origin block; U ZIP safety |
| 38 | Performance: indexed queries, trigram search, pagination, lazy thumbnails, background jobs | COMPLETED | schema indexes; design |
| 39 | Deployment artifacts and documentation | COMPLETED | `Dockerfile`, `docker-compose.yml`, CI workflow, README, this file. The standalone server was run and verified; Docker images could not be built here (no Docker daemon). |

## Test results (latest run)

| Suite | Command | Result |
|---|---|---|
| ESLint | `npm run lint` | clean |
| TypeScript | `npm run typecheck` | clean |
| Unit (Vitest) | `npx vitest run --project unit` | 53 passed |
| Integration (Vitest, real PostgreSQL 16 + S3-compatible server) | `npx vitest run --project integration` | 50 passed |
| End-to-end (Playwright, production build, worker running) | `npm run test:e2e` | 22 passed |
| Production build | `npm run build` | success (36 routes) |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

Bugs found and fixed by these tests: a production CSP that blocked WebAssembly (in-browser checksums); a shared login rate-limit bucket that could lock everyone out behind a proxy; a race in the preview-visibility toggle; chart captions that exposed internal ids to screen readers.
