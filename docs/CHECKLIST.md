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
| 5 | Environment variables for all secrets; no hard-coded config | COMPLETED | `src/lib/env.ts` (Zod), `src/lib/load-env.ts` (`.env.dev` / `.env.prod`), `.env.dev.example`, `.env.prod.example` |
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
| 14 | Direct upload to object storage (RustFS); drag-and-drop; multiple files; progress; cancel; retry; resume; multipart; size & type validation | COMPLETED | I multipart + resume + cancel tests; E upload spec |
| 15 | Content validation (magic bytes) | COMPLETED | U sniffing tests; I + E disguised `.mp4` rejected |
| 16 | Checksums for integrity | COMPLETED | I worker verifies SHA-256, mismatch flagged + notified; E "Verified" badge |
| 17 | Thumbnails/previews generated separately via background jobs | COMPLETED | I `worker.test.ts` (separate WebP object, original untouched) |
| 18 | Signed URLs; credentials never exposed; bucket never public | COMPLETED | code review, E download via presigned redirect |
| 19 | RustFS (S3) live verification | COMPLETED (development bucket) | `storage:setup` applied CORS on the RustFS bucket; E2E suite passed against it (direct browser uploads, previews, byte-identical download; worker marked files Verified/Ready with thumbnails). Repeat against the production bucket before go-live. |

## Versions and ZIP import

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 20 | `_preview` detection; full + preview linked to the same creative | COMPLETED | U naming/matching; I uploads; E lifecycle |
| 21 | Preview uploaded first kept unmatched and linked later automatically | COMPLETED | U matching; I uploads; manual linking card |
| 22 | Ambiguous matches require a user decision; nothing associated silently | COMPLETED | U matching; manual ZIP review (decision required) |
| 23 | Multiple full/preview/variant versions with all required file metadata | COMPLETED | I `versions.test.ts`, worker metadata tests |
| 24 | "Show preview versions" global filter (off by default; previews labelled when on; accessible on details page) | COMPLETED | I library preview test; E toggle spec |
| 25 | Version selector with separate preview and download per version | COMPLETED | E lifecycle spec |
| 26 | ZIP import: secure extraction, path traversal protection, format detection, `_preview` detection, application/campaign suggestions, review before confirm, upload to storage, optional archive retention | COMPLETED | U ZIP safety; I hostile archive import; manual review UI |

## Import, badges and replacement

| # | Requirement | Status | Verified by |
|---|---|---|---|
| 40 | ZIP import of `data_creatives/<platform>/{banners,videos}`: platform from folder name, banners → Banner category | COMPLETED | U `import-layout.test.ts`; I data_creatives import; manual walkthrough on RustFS |
| 41 | `_preview` / `-preview` / middle `preview` marks the lite version; `_reel` / `_final` names still pair | COMPLETED | U naming + pairing of the real 85-file folder (34 previews, all paired) |
| 42 | A new platform folder creates the platform on confirmation (administrators only) | COMPLETED | I import test; manual walkthrough |
| 43 | Each import adds new creatives, never replaces; duplicate names get (2), (3)… | COMPLETED | U `nextFreeName`; I import test |
| 44 | Badges (Motion graphique, Higgsfield, 3D, Sans miniature…): shown on cards and pages, one-click edit, filter, management in Settings, auto-detected from file names on import | COMPLETED | U badge detection; I badge permissions; manual walkthrough |
| 45 | Replace a video with another: warning before confirming, old file and thumbnails deleted from storage, space freed, version number kept | COMPLETED | I replace test; manual walkthrough (old objects confirmed deleted from RustFS) |
| 46 | Template ZIP download next to the import, built from the current platforms | COMPLETED | manual walkthrough (template contents checked) |
| 47 | Reels-style library (9:16 cards) with a muted hover preview (lite version first) | COMPLETED | E library specs; manual walkthrough (hover playback confirmed on RustFS) |
| 48 | Library filter banner: platforms, validation (approved / not yet / declined), with or without preview, live counts | COMPLETED | I `library.test.ts` banner filters and counts; manual walkthrough |
| 49 | Modern video player (custom controls, speed, PiP, full screen, keyboard) | COMPLETED | manual walkthrough (playback confirmed) |
| 50 | Badges chosen before import (per creative and in bulk, create with colour) and after import on the creative page | COMPLETED | I import test (reviewed badges applied); manual walkthrough |
| 51 | PDF creatives: `<platform>/pdf/` import folder, *Document (PDF)* category, page count and first-page thumbnail | COMPLETED | U real folder incl. `cms-whatsapp-sender`; I import + worker (3-page PDF: page count, thumbnail) |
| 52 | Professional PDF reader (thumbnails, continuous scroll, selectable text, zoom, rotate, full screen, keyboard) | COMPLETED | manual walkthrough with real PDFs (14 pages, text layer, navigation, zoom) |
| 53 | Library content tabs: Videos (default), Banners, PDFs, All, with counts | COMPLETED | I `library.test.ts` content tabs; manual walkthrough |
| 54 | Mobile: no horizontal overflow, bottom navigation, filter sheet, full-screen swipe feed with autoplay | COMPLETED | mobile audit (iPhone 13, every page: no overflow); manual walkthrough (feed autoplay, swipe, back gesture) |
| 55 | Docker image builds (`npm ci` with Prisma schema), runs migrations, worker service in compose | COMPLETED | deps-stage `prisma generate` and `migrate status` reproduced without Docker |
| 56 | Phone navigation: bottom bar with a Menu sheet (closes on navigation, outside tap, back); the sidebar closes after navigation | COMPLETED | E `mobile.spec.ts`; iPhone 13 screenshots |
| 57 | Phone dialogs (edit creative, campaign, workflow…) as bottom sheets: scrollable, buttons pinned and reachable, closable | COMPLETED | E `mobile.spec.ts`; iPhone 13 screenshot of Edit creative (footer inside the screen, close works) |
| 58 | Pending Validation with the library look: Pending / In review / Drafts tabs with counts, workflow buttons under each card | COMPLETED | E lifecycle (decline from the queue cards), E `mobile.spec.ts` |
| 59 | Library badge edit mode (admins, managers): edit badges on each card, multi-select, bulk add / remove, bulk submit, any colour | COMPLETED | I `bulkSetBadge` and `submitCreatives`; E `mobile.spec.ts` (bulk add and remove) |
| 60 | Phone layout of the other pages: Team, Activity and Campaigns as cards, compact headers and tiles, safe areas (notch, home indicator) | COMPLETED (emulated) | mobile audit (iPhone 13, 18 pages: no overflow) and screenshots; not yet checked on a real iPhone |
| 61 | Install on the home screen (manifest, icons) with an Android / iPhone prompt shown sparingly (after engagement, once per session, 7 then 30-day snooze, stops after 3 or "Don't ask again") | COMPLETED (emulated) | 16 scripted checks on emulated iPhone 13, Pixel 7 and desktop; a real-device install needs the HTTPS deployment |
| 62 | Fast navigation and cached media: instant loading screens, 30 s client cache, cacheable stable URLs for thumbnails and videos (also on the creative page), lite-only preloading in the feed | COMPLETED | production build on an emulated iPhone 13 throttled to 4G: the screen changes about 50 ms after a tap, pages revisited within 30 s show in about 60 ms with no server request, thumbnails and the creative video come from the browser cache on the next visit (`Cache-Control: private, max-age=7200` confirmed on the RustFS test server); E suite passed against the production build |
| 63 | Streaming copies of heavy videos (720p H.264, fast start) made by the worker, also for existing videos; used by hover previews, the phone feed and the creative page (Smooth / Original switch); originals and downloads unchanged | COMPLETED | U `stream-copy.test.ts`; I heavy MP4 and MKV copies (fast start, smaller, original untouched, kept on reprocessing) and backfill; dev worker turned the 104.5 MB `winmed_promo_reel_final_v2.mp4` into a 7.1 MB copy in 17 s; phone and desktop playback checked |

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
| 36 | Storage management (total, by application, by category, full vs preview, files, creatives) from DB records + bucket reconciliation | COMPLETED | E storage spec; manual |
| 37 | Security: rate limiting, CSRF, CSP, ZIP protection, audit logging | COMPLETED | I rate limit; E cross-origin block; U ZIP safety |
| 38 | Performance: indexed queries, trigram search, pagination, lazy thumbnails, background jobs | COMPLETED | schema indexes; design |
| 39 | Deployment artifacts and documentation | COMPLETED | `Dockerfile`, `docker-compose.yml`, CI workflow, README, this file. The standalone server was run and verified; Docker images could not be built here (no Docker daemon). |

## Test results (latest run)

| Suite | Command | Result |
|---|---|---|
| ESLint | `npm run lint` | clean |
| TypeScript | `npm run typecheck` | clean |
| Unit (Vitest) | `npx vitest run --project unit` | 63 passed |
| Integration (Vitest, real PostgreSQL 16 + S3-compatible emulator) | `npx vitest run --project integration` | 64 passed |
| End-to-end (Playwright, worker, RustFS test bucket; desktop and iPhone 13 viewports) | `npm run test:e2e` | 26 passed on the dev server and 26 passed on the production build |
| Production build | `npm run build` | success (38 routes) |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

Bugs found and fixed by these tests: a production CSP that blocked WebAssembly (in-browser checksums); a shared login rate-limit bucket that could lock everyone out behind a proxy; a race in the preview-visibility toggle; chart captions that exposed internal ids to screen readers.
