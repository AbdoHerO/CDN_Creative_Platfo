# Creative Hub — Complete Documentation

**Creative Hub** is the Creative Management Platform (CMP) for **Win+Pharma, iCoral, Pharmalien and WinMed**, and for any application added later. It is the single place where marketing creatives (videos, images, banners, documents, audio) are uploaded at full quality, organised, previewed, validated and downloaded.

This document covers everything: what the platform does, how each screen works, how it works internally, how to install and configure it, how to deploy and operate it, and how to develop on it.

> ### Branch policy: `main` only
> All development happens on the **`main`** branch. Do not create feature branches or push to any other branch, people and AI coding agents alike. Commit to `main` and push to `origin main`. The same rule is in [`AGENTS.md`](../AGENTS.md) so coding agents follow it. See [Development workflow](#17-development-workflow).

---

## Contents

1. [Overview](#1-overview)
2. [Quick start](#2-quick-start)
3. [Key concepts and glossary](#3-key-concepts-and-glossary)
4. [User guide](#4-user-guide)
   - [Signing in](#41-signing-in-and-passwords) · [Navigation](#42-navigation-and-shortcuts) · [Dashboard](#43-dashboard) · [Creative Library](#44-creative-library) · [Creative details](#45-creative-details) · [Uploading](#46-uploading-files) · [Full and preview versions](#47-full-and-preview-versions) · [ZIP import](#48-zip-import) · [Validation](#49-validation-workflow) · [Applications](#410-applications) · [Campaigns](#411-campaigns) · [Team and users](#412-team-and-users) · [Activity history](#413-activity-history) · [Notifications](#414-notifications) · [Storage](#415-storage) · [Settings](#416-settings) · [Profile](#417-profile)
5. [Roles and permissions](#5-roles-and-permissions)
6. [Supported file formats](#6-supported-file-formats)
7. [How it works](#7-how-it-works)
8. [Data model](#8-data-model)
9. [Security](#9-security)
10. [Installation and local setup](#10-installation-and-local-setup)
11. [Environment variables](#11-environment-variables)
12. [RustFS storage setup](#12-rustfs-storage-setup)
13. [Production deployment](#13-production-deployment)
14. [Operations and maintenance](#14-operations-and-maintenance)
15. [Testing](#15-testing)
16. [HTTP API reference](#16-http-api-reference)
17. [Development workflow](#17-development-workflow)
18. [Project structure](#18-project-structure)
19. [Troubleshooting](#19-troubleshooting)
20. [Known limitations](#20-known-limitations)

---

## 1. Overview

### What the platform does

| Need | How Creative Hub handles it |
|---|---|
| One place for every creative | A searchable library across all applications, campaigns, categories, channels and tags. |
| Never lose quality | Files go **straight from the browser to RustFS**, a self-hosted S3-compatible object store. They are never compressed, resized or re-encoded, and a SHA-256 checksum proves the stored file is byte-identical to the uploaded one. |
| Very large files | Multipart uploads (parallel parts, automatic retry, cancel, resume after a crash). The default limit is 20 GB per file. |
| Full and lightweight versions | `name.mp4` and `name_preview.mp4` (or `name-preview.mp4`) are recognised and linked to the **same creative** automatically; the preview is the lite version of the video. |
| Bulk upload | Zip a `data_creatives` folder with one folder per platform; it is checked for safety, reviewed and confirmed before anything is imported. A template ZIP can be downloaded. |
| Labels | Coloured **badges** (Motion graphique, Higgsfield, 3D, Sans miniature, …) shown on every creative and switched on with one click. |
| Quality control | A validation workflow (Draft → Pending → In review → Approved / Declined) with required decline reasons and a full history. |
| Access control | Four roles (Admin, Manager, Creator, Viewer), optional per-application restrictions, all enforced on the server. |
| Traceability | An audit log of every sign-in, upload, edit, status change, download and admin change, exportable to CSV. |

### Technology

- **Web app:** Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Lucide icons, React Hook Form + Zod.
- **Database:** PostgreSQL 14+ through Prisma 7 (`@prisma/adapter-pg`).
- **File storage:** RustFS (self-hosted, S3-compatible) through the S3 API (`@aws-sdk/client-s3`, presigned URLs).
- **Background worker:** a separate Node.js process that uses a PostgreSQL job queue, plus ffmpeg/ffprobe, sharp, poppler (`pdftoppm`, `pdfinfo`) and yauzl for ZIP files.
- **Tests:** Vitest (unit and integration tests against real services) and Playwright (end-to-end).

The system runs as **two processes**, the web app and the worker, that share one PostgreSQL database and one RustFS bucket. No Redis or other infrastructure is needed.

---

## 2. Quick start

For a developer machine with Node.js 22, PostgreSQL, ffmpeg and poppler installed. The full guide is in [section 10](#10-installation-and-local-setup).

```bash
npm install
```

```bash
cp .env.dev.example .env.dev
```

Edit `.env.dev`: set `DATABASE_URL`, `APP_URL`, the RustFS variables `URL_RUSTFS`, `BUCKET_NAME`, `ACCESS_KEY` and `SECRET_KEY` (see [10.3](#103-file-storage-for-development)) and `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (at least 10 characters).

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run storage:setup -- --create
```

Start the web app and the worker in two terminals:

```bash
npm run dev
```

```bash
npm run worker
```

Open <http://localhost:3000> and sign in with the seeded admin account.

---

## 3. Key concepts and glossary

| Term | Meaning |
|---|---|
| **Application** | A product or brand (Win+Pharma, iCoral, Pharmalien, WinMed, …). Every creative belongs to exactly one application. Admins add applications from the UI, without code changes. |
| **Campaign** | An optional grouping of creatives inside one application, with dates, a status and tags. |
| **Creative** | A logical asset, for example "Summer promo spot 30s". It holds the metadata (name, description, application, campaign, category, channels, tags, keywords) and the validation status. |
| **File / version** | One stored object attached to a creative. A creative can have many versions. |
| **Version type** | `FULL` (the master), `PREVIEW` (the lite version, detected from the word `preview` in the file name) or `VARIANT` (another cut or format). Each type has its own numbered history (v1, v2, …) and one **current** version. |
| **Preview-only creative** | A creative that has only a preview so far, because the preview was uploaded before its full version. It is linked automatically when the full version arrives. |
| **Match key** | The normalised base name used to pair files: `Summer_Promo_preview.MP4` → `summer promo`. |
| **Badge** | A coloured label on a creative, such as *Motion graphique*, *Higgsfield*, *3D* or *Sans miniature*. Admins and managers manage the list in **Settings → Badges**. |
| **Status** | `DRAFT`, `PENDING`, `IN_REVIEW`, `APPROVED`, `DECLINED` or `ARCHIVED` (see [4.9](#49-validation-workflow)). |
| **Category** | Marketing video, Advertising video, Social media post, Banner, Promotional image, Campaign visual, Document (PDF), Other. |
| **Channels** | Where a creative is used: Instagram, Facebook, LinkedIn, TikTok, YouTube, X, WhatsApp, Website, Email, Display ads, In-app, Print, Other. |
| **Integrity** | `VERIFIED` (the worker recomputed the SHA-256 from storage and it matches the browser's), `MISMATCH` (it does not; approval is blocked), `PENDING` or `UNVERIFIED`. |
| **Processing** | The worker's thumbnail and metadata extraction: `PENDING`, `PROCESSING`, `READY` or `FAILED`. A failure never affects the stored original. |

---

## 4. User guide

### 4.1 Signing in and passwords

- Sign in at `/login` with your email and password. Sessions last 7 days (configurable) and are extended automatically while you use the app.
- New accounts and password resets use a **temporary password**, shown once to the admin who created it. At first sign-in you are sent to **Change password** and cannot continue until you choose a new one (at least 10 characters).
- After repeated failed sign-ins the account is temporarily locked: 8 failures per account in 15 minutes, and 30 per network when `TRUST_PROXY` is enabled. Successful sign-ins never count towards these limits.
- Changing your password signs out all your other sessions.
- A disabled account is signed out everywhere immediately.

### 4.2 Navigation and shortcuts

The collapsible **sidebar** has four groups. Entries you are not allowed to use are hidden; the server refuses them anyway.

| Group | Entries |
|---|---|
| Workspace | Dashboard, Creative Library, Upload |
| Organize | Applications, Campaigns |
| Validation | Pending Validation (with a live count badge), Approved, Declined, Archived |
| Administration | Team & Users, Activity History, Storage, Settings |

The **top bar** has global search, notifications, a quick **Upload** button and the user menu (profile, settings, theme, sign out).

| Shortcut | Action |
|---|---|
| `Ctrl` + `K` / `⌘` + `K`, or `/` | Open global search: creatives (by name, filename, tag, keyword…), campaigns and applications |
| `Ctrl` + `B` / `⌘` + `B` | Collapse or expand the sidebar |

Light, dark and system themes are available from the user menu and from **Settings → Preferences**.

### 4.3 Dashboard

All figures come live from the database and respect your permissions (a viewer only sees statistics about approved creatives, for example).

- **Totals:** total creatives, videos, images, banners and approved creatives. Reviewers also see pending, in review, declined, archived and draft counts. Each tile opens the matching filtered list.
- **Uploads per day:** a column chart of recent upload activity.
- **Storage usage:** used space against the warning threshold set in Settings.
- **Creatives by application** and **Creatives by status:** bar charts that link to the filtered library.
- **Pending validation:** the oldest items waiting for review.
- **Recent uploads**, **Recently approved** and **Recent activity**.

### 4.4 Creative Library

`/library` lists every creative you can see.

- **Content tabs** at the top of the banner: **Videos** (the default), **Banners** (images), **PDFs** and **All**, each with its count. Banners and PDFs use landscape 4:3 cards.
- **Filter banner** below the tabs, with live counts that take the other active filters into account:
  - **Platform** chips: *All platforms* or one platform (brand colour and initials).
  - **Validation:** *All*, *Approved*, *Not yet* (draft, pending or in review) or *Declined*. Hidden for viewers, who only see approved creatives, and on the Approved / Declined / Archived pages.
  - **Lite version:** *All*, *With preview* or *Without preview*.
- **Reels grid or list view.** The grid shows tall 9:16 cards, like short-video ad libraries: the creative fitted on a blurred backdrop, with the platform, status, badges, name, duration, format and size over a gradient. A **LITE** tag means the creative has a preview version. **Hovering a video card plays a muted clip** (the first 6 seconds, looped) of the lite version when there is one, otherwise of the video itself. Clicking opens the creative. The list view shows the same information in a table. Your choice is remembered.
- **On phones** the library works like a short-video app: a two-column grid, a **Filters** button that opens every filter in a bottom sheet, and a bottom bar (Library, Search, **+** Upload, Validation, Menu). **Tapping a card opens a full-screen feed**: swipe up and down between creatives, the visible video plays automatically (muted; tap **Sound**), the next one is preloaded, and the right-hand rail offers Details, Download, Pause and Share. The phone's back gesture closes the feed. The feed contains the creatives of the current page.
- **Search** across names, descriptions, keywords, tags, campaign names, application names and original filenames. Every word must match (`summer banner` finds creatives that match both words).
- **Badges** appear on each thumbnail (and under the name in list view).
- **Filters**, which can all be combined: application, campaign, media type (video, image, document, audio), category, **badge**, status, tag, uploader, file format (`mp4`, `png`, …) and a date range.
- **Sort:** newest first, oldest first, alphabetical, recently updated, largest files, smallest files.
- **Pagination:** 24, 48 or 96 items per page (the default is set by an admin).
- **Show preview versions:** off by default, so the library shows one row per creative (its current full version). When it is on, preview files appear as their own items labelled **PREVIEW · LITE**. The setting is saved per user.
- Archived creatives are hidden from the library. Use the **Archived** page, or filter by status *Archived*.

Every filter is stored in the URL, so a filtered view can be bookmarked or shared. The parameters are:

| Parameter | Example | Meaning |
|---|---|---|
| `q` | `q=summer` | Search text |
| `app`, `campaign`, `uploader` | `app=<id>` | Application, campaign or uploader id |
| `kind` | `kind=banner` | Content tab: `video` (default), `banner`, `pdf` or `all` |
| `type` | `type=VIDEO` | `VIDEO`, `IMAGE`, `DOCUMENT`, `AUDIO`, `OTHER` (overrides the tab) |
| `category` | `category=BANNER` | A category key |
| `status` | `status=APPROVED` | A status key |
| `format` | `format=mp4` | File extension |
| `tag` | `tag=summer` | Tag slug |
| `badge` | `badge=higgsfield` | Badge slug |
| `review` | `review=waiting` | `approved`, `waiting` (not yet approved) or `declined` |
| `lite` | `lite=without` | `with` or `without` a preview (lite) version |
| `from`, `to` | `from=2026-01-01` | Upload date range (YYYY-MM-DD) |
| `sort` | `sort=largest` | `newest`, `oldest`, `name`, `updated`, `largest`, `smallest` |
| `page`, `size`, `view` | `size=48&view=list` | Page number, page size, `grid` or `list` |

The **Approved**, **Declined** and **Archived** pages are the same library, fixed to that status.

### 4.5 Creative details

`/creatives/<id>` shows one creative.

**Viewer.** Files are previewed in the browser and never forced to download:
- **Video:** a custom player with poster frame, big play button, a seek bar showing what is buffered and the time under the pointer, back/forward 10 seconds, volume, playback speed (0.5× to 2×), picture-in-picture and full screen. Controls hide while the video plays and come back when you move the mouse. Keyboard (click the player first): `Space`/`K` play or pause, `←`/`→` 5 seconds, `J`/`L` 10 seconds, `↑`/`↓` volume, `M` mute, `F` full screen; double-click for full screen. If the browser cannot play the format (MKV, AVI, some codecs), the page offers the `_preview` version or a download.
- **Image:** zoomable viewer (zoom with the buttons or the mouse wheel, drag to pan, fit to screen, actual size 100%, full screen). Formats browsers cannot display (TIFF, HEIC, PSD) are shown through a high-resolution WebP rendition made by the worker. The original is never changed.
- **PDF:** a reader built on pdf.js: page thumbnails on the left, continuous scrolling (pages are drawn as they come into view), selectable and copyable text, zoom (*Fit width*, *Fit page*, 50 % to 300 %, `Ctrl`/`⌘` + mouse wheel), rotation, page number entry, full screen, open in a new tab and download. Keyboard (click the reader first): `←`/`→` or `Page Up`/`Page Down` previous and next page, `Home`/`End` first and last page, `+`/`−` zoom, `0` fit width, `F` full screen. Library cards of PDFs show the first page, the page count and a **PDF** tag.
- **Audio:** audio player.

**Badges.** Under the title. Anyone who may edit the creative clicks **Add badge** / **Edit badges** and ticks badges on or off; the change is saved at once. Admins and managers can also type a new name to create a badge.

**Version selector.** When a creative has several versions, buttons such as **FULL VERSION — 185 MB** and **PREVIEW VERSION — 11 MB** switch the viewer. **Preview** and **Download** always apply to the selected version, and **Download** returns the original bytes with the original filename.

**Metadata panel:** application, campaign, category, channels, tags, keywords, uploader, dates and, for the selected file, original filename, format, size, resolution, duration, frame rate, codecs, bitrate, page count, SHA-256 checksum and integrity status.

**Tabs:**
- **Versions:** every version of every type, with **Make current version**, **Replace file…**, **Move to another creative…** and **Delete version** (the last remaining file cannot be deleted).
- **Validation history:** every status change with the reviewer, time, comment, decline reason and the version that was reviewed.
- **Activity:** the audit trail for this creative.

**Actions** (shown only when you are allowed): workflow actions (submit, approve, decline, …), **Edit** metadata, **Upload new version**, **Replace file**, **Archive**, **Restore**, **Delete permanently**.

**Replace file** (under the viewer, or in a version's menu) swaps the selected file for another one of the same kind: a video for a video, an image for an image. After you choose the new file, a red warning shows the old and new names and the space that will be freed, and you confirm with **Replace and delete old file**. Once the new file is uploaded and checked, the old file, its thumbnail and display rendition are **deleted from storage**. The new file keeps the same version number (for example *Full v1*), and the activity log records the replacement. Replacing the current full version of an approved creative returns it to draft when **Settings → Platform → Re-validate after a new full version** is on. Use **Upload version** instead when you want to keep the previous file in the history.

When a preview-only creative may belong to an existing full version, a **link card** suggests the match so you can confirm it.

### 4.6 Uploading files

`/upload` has two tabs: **Files** and **ZIP import** ([4.8](#48-zip-import)).

1. Choose the default **application** (required) and, optionally, a **campaign**.
2. Drag files onto the drop zone or browse. You can add many files at once.
3. For each file, the page shows the detected **version type** (FULL or PREVIEW) and what will happen to it, for example *"Linked to the full version in this batch"* or *"Will be added to existing creative X"*. You can change the target creative, or create a new one, from the lookup dialog.
4. For each file you can change the version type, the target creative, the creative name and the category. Tags, channels and a description can be set once for the whole upload; they apply to every new creative and can be edited later.
5. Click **Start upload**. Each file shows its progress, speed and status. **Cancel** stops a file; **Retry** restarts a failed file.

What happens behind the scenes:
- Files of 32 MB or more are uploaded in 16 MB parts, 4 at a time. Each part is retried up to 4 times with increasing delays.
- The browser computes the SHA-256 checksum while uploading.
- The server checks the stored size and the file's real content (its "magic bytes"). A file whose content does not match its extension, such as a text file renamed `.mp4`, is rejected and deleted.
- The worker then makes thumbnails, reads the metadata and verifies the checksum.

**Resuming.** If the browser closes or the network drops, the **Interrupted uploads** panel lists unfinished uploads. Select the same file again and only the missing parts are uploaded. Unfinished uploads are cleaned up automatically after 48 hours.

**Names.** A new creative never takes a name already used in its application: an existing *Spot* makes the next one *Spot (2)*, then *Spot (3)*.

**Limits.** The maximum file size is the lower of `UPLOAD_MAX_FILE_SIZE_MB` (server) and the value set in **Settings → Platform**. Only the formats in [section 6](#6-supported-file-formats) are accepted.

### 4.7 Full and preview versions

A **preview** is the lite version of a video (or of any file). A file is a preview when its name contains the word `preview` as a separate word after the first one, separated by `_`, `-`, `.` or a space, in any letter case. The rest of the name is the **match key**, used to find its full version:

| File | Version type | Match key |
|---|---|---|
| `Summer_Promo.mp4` | FULL | `summer promo` |
| `Summer_Promo_preview.mp4` | PREVIEW | `summer promo` |
| `summer-promo-PREVIEW.mov` | PREVIEW | `summer promo` |
| `promo_preview_v2.mp4` | PREVIEW | `promo v2` |
| `preview_of_launch.mp4`, `spot_previews.mp4` | FULL | (not a preview) |

When a preview finds no full version with exactly the same name in the same upload or ZIP, it is paired with the only full version whose name matches once the words *reel*, *final*, *master*, *full*, *hd* and *hq* are ignored: `spot_preview.mp4` ↔ `spot_reel.mp4`, `promo_preview_v2.mp4` ↔ `promo_reel_final_v2.mp4`. If two full versions could match, nothing is paired automatically.

Matching rules. Matching only happens **within the same application**, and nothing is ever linked silently:

| Situation | Result |
|---|---|
| Full and preview in the same upload | One new creative with both versions |
| Preview only, no existing match | A new preview-only creative, shown as an *unmatched preview* |
| Full version whose only match is a preview-only creative | The full version completes that creative automatically |
| Preview with exactly one existing match | Attached to that creative (shown before upload, and you can change it) |
| Several candidates, or a full version that would collide with an existing full version | **You must decide.** The upload is blocked until you choose |

Files can be moved between creatives later (**Versions → Move to another creative…**). Every link and move is recorded in the activity log.

### 4.8 ZIP import

**Upload → ZIP import** imports a whole folder of creatives at once.

**Folder structure.** Put one folder per platform (application) inside a `data_creatives` folder, with the files in `banners/` and `videos/`:

```
data_creatives/
  icoral/
    banners/   banner.jpg
    videos/    spot.mp4
               spot_preview.mp4
    pdf/       guide.pdf
  win+pharma/
    banners/
    videos/
    pdf/
```

**Download import template** (on the ZIP import tab) gives you this skeleton as a ZIP, with one folder for every active platform you can upload to and a `README.txt` that the import ignores.

1. Zip the `data_creatives` folder and choose it. The **fallback application** and campaign only apply to files that are not inside a platform folder. Optionally tick **Keep the original archive as an import record** to keep the ZIP itself in storage (the default comes from **Settings → Platform**).
2. Upload the ZIP. It goes directly to storage, like any other file.
3. The worker **analyses** the archive:
   - **Platform:** the folder just above `banners/` or `videos/` (also `banner`, `video`, `images`) names the platform. It matches an application by name, ignoring case and punctuation (`win+pharma` ↔ *Win+Pharma*, `icoral` ↔ *iCoral*). The wrapper folder (`data_creatives/`) is ignored. Archives without media folders still work: a folder named after an application anywhere in the path is used.
   - **New platform:** a platform folder that matches no application becomes a **new platform**. It is created when an administrator confirms the import; for anyone else the review asks them to choose an existing platform. A folder that matches a disabled application, or one you cannot access, falls back to the default application.
   - **Category:** files in `banners/` get the *Banner* category and files in `pdf/` (also `pdfs`, `documents`, `docs`) the *Document (PDF)* category; others get the default for their type (videos: *Marketing video*, PDFs: *Document (PDF)*).
   - **Previews** are paired with their full version ([4.7](#47-full-and-preview-versions)).
   - **Always new creatives:** an import never adds files to creatives already in the library and never replaces anything. A name already used in the platform gets *(2)*, *(3)*…
   - **Badges:** a badge whose name appears as whole words in the file name is added automatically (`…-higgsfield.mp4` → *Higgsfield*, `…_3d_reel.mp4` → *3D*).
   - Entries are rejected, with a reason for each, for: path traversal (`..`), absolute paths, drive letters, control characters, paths that are too deep or too long; symbolic links and encrypted entries; unsupported formats, and system junk (`__MACOSX`, `.DS_Store`, `Thumbs.db`); zip bombs (too many entries `ZIP_MAX_ENTRIES`, too large in total `ZIP_MAX_UNCOMPRESSED_MB`, or a suspicious compression ratio `ZIP_MAX_COMPRESSION_RATIO`); files whose content does not match their extension.
4. The **review page** (`/imports/<id>`) lists every entry with its version type, platform (*From folder name* or *New platform*), campaign, category, creative name and **badges**, and how files are grouped. New platforms are announced at the top. You can include or exclude entries, rename creatives and change any choice.
   - **Badges before import:** each new creative has a badge select (already filled with the badges detected from its file name). Tick badges on or off, or type a new name, pick a colour and create it (admins and managers). **Badges** at the top applies a badge to every selected creative at once, or removes it when all of them have it. Preview files take the badges of their full version.
5. Click **Import**. The worker creates any new platforms, extracts each accepted entry, streams it to storage under a new, generated key (never under the archive's path), and registers the creatives and versions. The normal processing (thumbnails, metadata, checksum) follows.

You get a notification when the analysis is ready and when the import finishes. If you did not choose to keep the archive, it is deleted after the import.

### 4.9 Validation workflow

```
DRAFT ──submit──▶ PENDING ──start review──▶ IN_REVIEW ──approve──▶ APPROVED
  ▲                 │                          │
  │                 └──withdraw──▶ DRAFT       ├──decline (reason required)──▶ DECLINED ──resubmit──▶ PENDING
  │                                            └──request changes (comment required)──▶ DRAFT
  └── new full version uploaded to an APPROVED creative (configurable)

APPROVED ──reopen (comment required)──▶ IN_REVIEW
Any status ──archive──▶ ARCHIVED ──restore──▶ previous status (IN_REVIEW returns to PENDING)
```

| Action | From | To | Comment | Who |
|---|---|---|---|---|
| Submit for validation | Draft, Declined | Pending | optional | Owner (creator), Manager, Admin |
| Withdraw submission | Pending | Draft | optional | Owner, Manager, Admin |
| Start review | Pending | In review | optional | Manager, Admin |
| Approve | Pending, In review | Approved | optional | Manager, Admin |
| Decline | Pending, In review | Declined | **reason required** | Manager, Admin |
| Request changes | Pending, In review | Draft | **required** | Manager, Admin |
| Reopen review | Approved | In review | **required** | Manager, Admin |
| Archive | any except Archived | Archived | optional | Manager, Admin; creators for their own drafts and declined creatives |
| Restore | Archived | previous status | optional | Manager, Admin |

Rules:
- A creative needs at least one **full** version before it can be submitted.
- Approval is blocked while a file's integrity is `MISMATCH`.
- Approving or declining directly from *Pending* first records a *Review started* step, so the history always shows the full path.
- When a new full version is uploaded to an approved creative, it goes back to *Draft* (history entry "Returned to draft (new full version)"). Admins can turn this off in **Settings → Platform**.
- Each step records the creative, the previous and new status, the reviewer, the time, the comment or reason and the file version reviewed. The status change, history row, audit entry and notifications are saved together in one database transaction.

The **Pending Validation** page (`/validation`) is the reviewers' queue, with approve, decline and request-changes buttons on each item.

### 4.10 Applications

`/applications` lists all applications with their logo, brand colour, number of creatives and storage used. `/applications/<id>` shows one application's statistics, campaigns and recent creatives.

Admins can **create** and **edit** an application (name, brand colour, description), **upload or remove its logo** (PNG, JPEG, WebP or SVG) and **disable** or re-enable it. A disabled application keeps its creatives and history but no longer accepts uploads or ZIP imports. The four initial applications are created by the seed.

### 4.11 Campaigns

`/campaigns` lists campaigns, with search and filters by application and status. Managers and admins can create, edit and delete campaigns: name, application, description, start and end dates, status (Planned, Active, Paused, Completed, Archived) and tags. `/campaigns/<id>` shows the campaign's details and creatives. Deleting a campaign keeps its creatives; they simply lose the campaign link.

### 4.12 Team and users

`/team` (admins only):
- **Create a user:** name, email, job title, role and, optionally, a restriction to specific applications. A temporary password is shown **once** for you to share securely; the user must change it at first sign-in.
- **Edit** a user's name, job title, role and application access. A role change signs the user out of all sessions so it takes effect immediately.
- **Disable / enable** an account. Disabling revokes all of its sessions immediately.
- **Reset password:** issues a new temporary password and signs the user out everywhere.
- The last active admin cannot be demoted or disabled.

### 4.13 Activity history

`/activity` (admins and managers) is the audit log. It records sign-ins (including failures), sign-outs, password changes, creative creation, edits, deletions and status changes, approvals and declines, uploads and new versions, file replacements (with the space freed), file moves, deletions, downloads and integrity failures, badge changes, application, campaign, user and settings changes, ZIP imports and storage checks.

You can search it (activity, user or creative) and filter by user, action, entity type (user, creative, file, application, campaign, import), application and date range. **Export CSV** downloads the filtered log; cells are escaped so the file is safe to open in a spreadsheet. Entries keep their readable summary even after the creative or user they mention has been deleted.

### 4.14 Notifications

The bell in the top bar and `/notifications` show in-app notifications:

| Notification | Sent to |
|---|---|
| New submission | Reviewers (managers and admins with access to the application) |
| Approved / Declined / Changes requested | The creative's owner |
| Processing failed / Integrity check failed | The uploader |
| ZIP ready for review / Import completed / Import failed | The person who started the import |

You never get a notification for your own action. Notifications can be marked read one at a time or all at once. There are no emails (see [Known limitations](#20-known-limitations)).

### 4.15 Storage

`/storage` (admins and managers) is calculated from the database records:
- **Total stored** (with the number of files and creatives), **Full versions**, **Preview versions** and **Estimated monthly cost** (from your own price per GB-month set in Settings);
- **Capacity planning:** usage against the warning threshold;
- **Storage by application**, **Storage by category** and **Largest files**;
- **Bucket reconciliation** (admins): the worker lists the real bucket and compares it with the database. It reports objects that exist in the bucket but not in the database (orphans) and records whose object is missing.

### 4.16 Settings

`/settings`:
- **Preferences** (everyone): theme, default library view, show preview versions.
- **Badges** (admins and managers): add a badge (name and colour), rename or recolour it, and delete it (it is removed from every creative; the creatives themselves are not changed). The seed creates *Motion graphique*, *Higgsfield*, *3D* and *Sans miniature*.
- **Platform** (admins):

| Setting | Default | Effect |
|---|---|---|
| Reset approval on new full version | on | An approved creative goes back to Draft when a new full version is uploaded |
| Keep ZIP import archives | off | The default for the "keep the original archive" option |
| Maximum upload size (MB) | `UPLOAD_MAX_FILE_SIZE_MB` | Can be lowered, never raised above the server limit |
| Storage warning threshold (GB) | 500 | Warning shown on the Dashboard and Storage pages |
| Storage price per GB-month (USD) | 0.015 | Your own RustFS cost (disks, replication, backups); used for the cost estimate |
| Default page size | 24 | Library page size (24, 48 or 96) |

- **System status** (admins): whether RustFS storage is configured (bucket and endpoint), background worker health (jobs queued or running, jobs failed in the last 24 hours, time of the last completed job, and a warning when the queue is not being processed), and the active upload and ZIP import limits.

### 4.17 Profile

`/profile`: edit your name and job title, change your password, see and **revoke your active sessions** (device, IP address, last activity) and see your recent activity.

---

## 5. Roles and permissions

Every rule is enforced on the server (`src/lib/permissions.ts`, `src/lib/visibility.ts`). Hiding a button in the UI is only a convenience. A creative you are not allowed to see returns "not found".

| Capability | Admin | Manager | Creator | Viewer |
|---|:-:|:-:|:-:|:-:|
| See creatives | all | all | everything except other people's drafts | approved only |
| Preview and download | ✅ | ✅ | what they can see | approved only |
| Upload files, ZIP import | ✅ | ✅ | ✅ | — |
| Edit metadata, add versions | all (not archived) | all (not archived) | own drafts and declined | — |
| Submit for validation | ✅ | ✅ | own | — |
| Start review, approve, decline, request changes, reopen | ✅ | ✅ | — | — |
| Archive | ✅ | ✅ | own drafts and declined | — |
| Restore | ✅ | ✅ | — | — |
| Delete creatives | any | — | own drafts never submitted | — |
| Manage campaigns | ✅ | ✅ | — | — |
| Switch badges on a creative | ✅ | ✅ | own drafts and declined | — |
| Manage the badge list | ✅ | ✅ | — | — |
| Replace a file | ✅ | ✅ | own drafts and declined | — |
| Create platforms from a ZIP import | ✅ | — | — | — |
| Manage applications, users and platform settings | ✅ | — | — | — |
| Activity history, storage analytics | ✅ | ✅ | — | — |
| Bucket reconciliation | ✅ | — | — | — |

**Per-application restriction:** any user can additionally be limited to specific applications. They then see nothing, including search results, statistics and notifications, from other applications.

---

## 6. Supported file formats

| Type | Extensions | Previewed in the browser |
|---|---|---|
| Video | `mp4`, `m4v`, `mov`, `webm` | yes |
| Video | `mkv`, `avi` | no (thumbnail and metadata are extracted; download or use the preview version) |
| Image | `jpg`/`jpeg`, `png`, `gif`, `webp`, `avif`, `svg`, `bmp` | yes |
| Image | `tif`/`tiff`, `heic`/`heif`, `psd` | through a WebP rendition (up to 2560 px) made by the worker |
| Document | `pdf` | yes (PDF reader with thumbnails, zoom and selectable text) |
| Document | `ai`, `eps` | download; PDF-compatible `.ai` files also get a thumbnail and a preview image |
| Audio | `mp3`, `wav`, `m4a`, `aac`, `ogg` | yes |
| Archive | `zip` | ZIP import only |

Every file's real content is checked against its extension. SVG files are checked as XML documents with an `<svg>` root.

---

## 7. How it works

### 7.1 Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js UI]
    UE[Upload engine<br/>multipart + SHA-256]
  end
  subgraph Web["Web app (stateless, scalable)"]
    PX[proxy.ts<br/>CSP, headers, auth redirect]
    RSC[Server Components<br/>role-scoped queries]
    SA[Server Actions<br/>mutations]
    API[Route handlers<br/>uploads, downloads, search]
  end
  subgraph Worker["Worker (scalable)"]
    Q[Job runner]
    MP[ffprobe, ffmpeg, sharp, poppler]
    ZIP[ZIP analysis and extraction]
  end
  DB[(PostgreSQL)]
  S3[(RustFS<br/>S3-compatible)]
  UI --> PX --> RSC & SA & API
  RSC & SA & API --> DB
  API -- presign / complete --> S3
  UE -- presigned PUT --> S3
  UI -- presigned GET --> S3
  Q --> DB
  Q --> MP & ZIP
  MP & ZIP <--> S3
```

- **Files never pass through the web servers.** Browsers upload to and download from RustFS with short-lived presigned URLs; the app only checks permissions and signs requests.
- **PostgreSQL is the system of record** for metadata, permissions, sessions, rate limits, the job queue and the audit log.
- **Every page is rendered dynamically per user.** All queries go through `creativeVisibilityWhere()` so each user sees only what their role and application access allow.
- **Mutations** are Server Actions (forms and buttons) or route handlers (uploads), and each one checks authentication, permission and rate limits.

### 7.2 Upload pipeline

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as Web app
  participant R as RustFS
  participant W as Worker
  B->>A: POST /api/uploads/plan (names, sizes)
  A-->>B: version types + association suggestions
  B->>A: POST /api/uploads (confirmed choices, metadata)
  A->>R: CreateMultipartUpload (or presigned PUT for small files)
  loop each part, 4 in parallel, retried
    B->>A: POST /api/uploads/:id/parts
    A-->>B: presigned part URLs
    B->>R: PUT part
  end
  B->>A: POST /api/uploads/:id/complete {sha256}
  A->>R: ListParts, CompleteMultipartUpload, HEAD, ranged GET (magic bytes)
  A->>A: register the version (transaction + audit log), enqueue PROCESS_FILE
  W->>R: stream the original, compute SHA-256, extract metadata
  W->>R: PUT thumbnail / display rendition (separate objects)
```

- **Resume:** each upload session stores a fingerprint (name, size, last-modified date). The storage server's `ListParts` is the source of truth for which parts already exist.
- **Cancel:** aborts the multipart upload in storage and removes the creative if it was created only for this upload.
- **Originals are written once and never rewritten.** Thumbnails (WebP, up to 640 px) and display renditions (WebP, up to 2560 px) are separate objects.

### 7.3 Background worker

The worker (`npm run worker`) claims jobs from the `Job` table with `FOR UPDATE SKIP LOCKED`, so any number of replicas can run safely.

| Job | What it does |
|---|---|
| `PROCESS_FILE` | Streams the original from storage, recomputes SHA-256 and compares it with the browser's checksum (a mismatch flags the file and notifies the uploader), extracts metadata (ffprobe for video and audio, sharp for images, pdfinfo for PDFs) and makes the thumbnail and display rendition (ffmpeg, sharp, pdftoppm) |
| `ANALYZE_IMPORT` | Reads a ZIP's directory, applies the safety checks, sniffs each entry's content and builds the review list with suggestions |
| `RUN_IMPORT` | Extracts the confirmed entries, uploads them to storage and registers creatives and versions |
| `DELETE_OBJECTS` | Deletes stored objects after a creative or version is deleted |
| `RECONCILE_STORAGE` | Compares the bucket with the database (Storage → Reconcile) |

- **Retries:** a failed job is retried with exponential backoff (15 s, 30 s, 60 s, … up to 30 minutes) until it runs out of attempts, then marked `FAILED` with its last error and counted in **Settings → System status**.
- **Heartbeats:** a running job is refreshed regularly. If a worker dies, its jobs are re-queued after 5 minutes without a heartbeat.
- **Maintenance** (every 5 minutes, one replica at a time through a PostgreSQL advisory lock): deletes expired sessions and old rate-limit windows, aborts upload sessions older than `UPLOAD_SESSION_TTL_HOURS` and frees their storage, removes empty creatives left by failed uploads, and purges completed jobs after 7 days and failed jobs after 30 days.
- **Shutdown:** on `SIGTERM` or `SIGINT` the worker stops claiming new jobs and waits up to 60 seconds for running jobs to finish. An interrupted job is picked up again later.
- **Logs** are JSON lines on stdout.

If the worker is stopped, uploads still succeed; thumbnails, metadata and checksum checks simply wait until it runs again.

### 7.4 Storage layout in the bucket

Object keys use immutable ids, so renaming a creative never moves files.

| Key | Content |
|---|---|
| `originals/<applicationId>/<creativeId>/<fileId>/<safe-filename>` | Original files, byte-for-byte |
| `derived/<fileId>/thumbnail.webp` | Thumbnail |
| `derived/<fileId>/display.webp` | Display rendition for formats browsers cannot show |
| `imports/<batchId>/…` | ZIP archives (kept only if requested) |
| `branding/…` | Application logos |

The original filename is stored in the database and sent back on download through the `Content-Disposition` header, so the downloaded file keeps its original name, including accented characters.

### 7.5 Downloads and previews

- `GET /api/files/<id>/download` checks permission, logs a `FILE_DOWNLOADED` audit entry and redirects to a presigned storage URL valid for 5 minutes (`DOWNLOAD_URL_TTL_SECONDS`).
- `GET /api/files/<id>/preview` redirects to an inline presigned URL valid for 4 hours (`SIGNED_URL_TTL_SECONDS`), which the video player and PDF viewer use.
- Thumbnail URLs are signed with an hour-rounded timestamp, so the same URL is reused for an hour and cached by the browser.

---

## 8. Data model

The schema is in `prisma/schema.prisma`. Media binaries are never stored in PostgreSQL. Sizes use `BigInt` because masters can exceed 2 GB.

| Model | Purpose |
|---|---|
| `Role` | The four roles (metadata; the permission matrix lives in code) |
| `User` | Account, role, status, preferences (preview toggle, library view), application restriction |
| `UserApplicationAccess` | Applications a restricted user may access |
| `Session` | Sign-in sessions; only the SHA-256 hash of the token is stored |
| `RateLimit` | Fixed-window counters shared by all web replicas |
| `Application` | Name, slug, description, brand colour, logo, status, display order |
| `Campaign` | Application, name, dates, status, description, tags (`CampaignTag`) |
| `Creative` | Name, description, application, campaign, category, media type, status, channels, keywords, match key, timestamps (submitted, approved, declined, archived) |
| `CreativeFile` | One stored version: type, number, current flag, label, original filename, storage key, size, MIME type, dimensions, duration, frame rate, codecs, bitrate, page count, browser and verified checksums, integrity and processing status, thumbnail and display keys, extra metadata |
| `Tag`, `CreativeTag` | Tags on creatives |
| `Badge`, `CreativeBadge` | Badges (name, slug, colour, order) and the creatives that carry them |
| `Validation` | One row per workflow step: action, from and to status, reviewer, comment, reason, file reviewed |
| `ActivityLog` | Audit log: actor, action, entity, summary, metadata, IP address, user agent |
| `Notification` | In-app notifications with read state |
| `UploadSession` | Direct-to-storage upload state: mode, S3 multipart upload id, part size and count, fingerprint, target creative, the file it replaces (if any), expiry |
| `ImportBatch`, `ImportItem` | ZIP imports: per-entry checks, suggestions (including a new platform name), the user's decisions and the result |
| `Job` | The background job queue |
| `StorageSnapshot` | Results of bucket reconciliations |
| `SystemSetting` | Admin-editable platform settings |

**Migrations** are in `prisma/migrations/`:
1. `20261030015219_init`: the full schema. It also enables the `pg_trgm` extension, used for fast text search on creative names and filenames.
2. `20261030022057_import_item_review`: review fields for ZIP import items.
3. `20261030135813_badges_replace_platform_import`: badges, file replacement (`UploadSession.replacesFileId`, `FILE_REPLACED` activity) and new platforms in ZIP imports (`ImportItem.newApplicationName`).
4. `20261030150250_import_item_badges`: badges chosen in the import review (`ImportItem.badgeIds`).
5. `20261030152309_document_category`: the *Document (PDF)* category (`CreativeCategory.DOCUMENT`).

**Seed** (`npm run db:seed`, safe to run more than once): the four roles, the four applications (Win+Pharma, iCoral, Pharmalien, WinMed), the four default badges and the first admin from `SEED_ADMIN_*`. If `SEED_ADMIN_PASSWORD` is empty or shorter than 10 characters, a temporary password is generated, printed once and must be changed at first sign-in. With `SEED_DEMO_USERS=true` (development only; refused when `NODE_ENV=production`) it also creates `manager@cmp.local`, `creator@cmp.local` and `viewer@cmp.local` (password `SEED_DEMO_PASSWORD`, or `Demo-Password-2026` when it is empty) plus sample campaigns and tags.

Further diagrams (entity relationships, matching and workflow state machine) are in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 9. Security

| Area | Measures |
|---|---|
| Passwords | argon2id hashing; at least 10 characters; temporary passwords must be changed at first sign-in |
| Sessions | 256-bit random tokens stored only as SHA-256 hashes; `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookie; sliding expiry; revoked on disable, password change or reset |
| Authorisation | Checked on every page, Server Action and route handler; resource-level checks; role-scoped queries; inaccessible resources return 404 |
| CSRF | Built-in origin check for Server Actions; same-origin check (`Origin` and Fetch-Metadata headers) for mutating API routes |
| Rate limiting | Failed sign-ins (8 per account and, with `TRUST_PROXY`, 30 per IP per 15 minutes), password changes, search, uploads, downloads, lookups, ZIP imports and CSV exports, stored in PostgreSQL |
| HTTP headers | Per-request nonce Content-Security-Policy, `frame-ancestors 'none'`, HSTS in production, `nosniff`, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy |
| Storage | Private bucket; RustFS credentials exist only on the server and are never sent to the browser; presigned URLs are limited to one object or part and expire quickly; the bucket is never publicly writable |
| Uploads | Extension allow-list, size limits, stored-size check, content (magic byte) check, checksum verification |
| ZIP files | See [4.8](#48-zip-import). Entries are streamed to generated keys and never written to disk under their archive path |
| Audit | Activity log of security-relevant events; CSV export escapes formula characters |
| Secrets | Environment variables only, validated at startup; never logged or displayed |

---

## 10. Installation and local setup

### 10.1 Prerequisites

| Software | Version | Used by |
|---|---|---|
| Node.js | 20.9 or newer (22 recommended) | web app, worker, scripts |
| PostgreSQL | 14 or newer, with `pg_trgm` available (it is by default) | database |
| ffmpeg and ffprobe | any recent version | worker: video and audio metadata, thumbnails |
| poppler-utils (`pdftoppm`, `pdfinfo`) | any recent version | worker: PDF metadata and thumbnails |
| File storage | A RustFS server (or any S3-compatible server for development) | uploads |

On Debian or Ubuntu:

```bash
sudo apt-get install -y postgresql ffmpeg poppler-utils
```

On macOS with Homebrew:

```bash
brew install postgresql@16 ffmpeg poppler
```

### 10.2 Database

Create a database and user, for example:

```bash
sudo -u postgres psql -c "CREATE USER cmp WITH PASSWORD 'change-me';" -c "CREATE DATABASE cmp OWNER cmp;"
```

Or start one with Docker:

```bash
docker compose --env-file .env.dev up -d db
```

Then set `DATABASE_URL="postgresql://cmp:change-me@127.0.0.1:5432/cmp"` in `.env.dev`.

### 10.3 File storage for development

Use one of these:

- **A RustFS development bucket** (recommended): a bucket on your RustFS server reserved for development. Set `URL_RUSTFS` (for example `https://files.example.com`), `BUCKET_NAME`, `ACCESS_KEY` and `SECRET_KEY` in `.env.dev`, then follow [section 12](#12-rustfs-storage-setup).
- **RustFS on your machine:** download the build for your OS from the [RustFS releases](https://github.com/rustfs/rustfs/releases) (Windows, macOS and Linux) and start it with a data folder, for example `rustfs server --address 127.0.0.1:9000 ./rustfs-data` (credentials from `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`). Then set `URL_RUSTFS="http://127.0.0.1:9000"`. With Docker you can also use the bundled service: `docker compose --env-file .env.dev --profile rustfs up -d rustfs`.
- **moto (Python), for tests only:** an in-memory S3 emulator; files are lost when it stops. Install and start it with the commands below, then set `URL_RUSTFS="http://127.0.0.1:9000"`, `ACCESS_KEY="test"`, `SECRET_KEY="test"` and `BUCKET_NAME="cmp-dev"`.

  ```bash
  pip install "moto[server,s3]"
  ```

  ```bash
  moto_server -p 9000
  ```

### 10.4 Install, configure and run

```bash
npm install
```

`npm install` also generates the Prisma client (`src/generated/prisma`).

```bash
cp .env.dev.example .env.dev
```

Edit `.env.dev` (see [section 11](#11-environment-variables)). Then apply the migrations and seed:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Create the bucket if it does not exist and apply its CORS rules:

```bash
npm run storage:setup -- --create
```

Run the web app:

```bash
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker
```

Open <http://localhost:3000>.

### 10.5 Demo data (optional, development only)

Set `SEED_DEMO_USERS=true` in `.env.dev`, run `npm run db:seed` again, then generate real sample media through the real upload and processing pipeline (needs ffmpeg and the worker running):

```bash
npm run demo:media
```

### 10.6 npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Copy the pdf.js runtime to `public/pdfjs`, then start the development server (Turbopack) on port 3000 |
| `npm run build` | Generate the Prisma client, copy the pdf.js runtime to `public/pdfjs` and build for production |
| `npm run start` | Start the production server (after `build`) |
| `npm run worker` / `npm run worker:dev` | Background worker / worker with auto-reload |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create a new migration after changing `schema.prisma` |
| `npm run db:seed` | Seed roles, applications, admin (and demo data if enabled) |
| `npm run db:bootstrap` | First-run bootstrap: roles, first admin if none, initial platforms and badges on an empty database (run by the production container on start) |
| `npm run db:studio` | Open Prisma Studio to browse the database |
| `npm run storage:setup [-- --create]` | Check the bucket, apply CORS (and create the bucket) |
| `npm run demo:media` | Generate sample creatives (development) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm test` / `npm run test:watch` | Unit and integration tests / watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |

---

## 11. Environment variables

Every setting comes from environment variables, validated at startup by `src/lib/env.ts`.

### Environment files: `.env.dev` and `.env.prod`

`src/lib/load-env.ts` loads one file into the environment before anything reads it. It is imported first by `next.config.ts`, `prisma.config.ts`, the worker and the scripts.

| File | Loaded when | Used by |
|---|---|---|
| `.env.dev` | `NODE_ENV` is not `production` | `npm run dev`, `npm run worker`, `npm run db:*`, `npm run storage:setup`, `npm run demo:media` |
| `.env.prod` | `NODE_ENV=production` | `npm run build`, `npm run start`, the Docker images and `docker compose` (`env_file: .env.prod`) |

- `ENV_FILE=<file>` loads another file instead, for example `ENV_FILE=.env.dev npm run start` to run a production build with development settings.
- Variables already set in the real environment always win, so hosting providers and containers can inject values without any file.
- Both files are git-ignored and never copied into Docker images. Commit only the templates [`.env.dev.example`](../.env.dev.example) and [`.env.prod.example`](../.env.prod.example).
- Do not create a plain `.env`: Next.js would load it as well, and its values would take precedence.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_URL` | Public URL of the app, for example `https://creatives.example.com`. Used for origin checks and bucket CORS |
| `URL_RUSTFS` | S3 API endpoint of the RustFS server, for example `https://files.example.com`. Browsers upload and download through presigned URLs on this host, so it must be reachable from users' browsers as well as from the app and the worker |
| `BUCKET_NAME` | Bucket name |
| `ACCESS_KEY`, `SECRET_KEY` | RustFS access key and secret key with read and write access to the bucket |

If the storage variables are missing, the app still runs but shows "File storage is not configured" and disables uploads; it never pretends storage works.

### Optional

| Variable | Default | Description |
|---|---|---|
| `ENV_FILE` | `.env.dev` / `.env.prod` | Environment file to load (see above) |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy or load balancer so client IPs come from `X-Real-IP` / `X-Forwarded-For` |
| `SESSION_TTL_DAYS` | `7` | Sliding session lifetime |
| `DATABASE_POOL_SIZE` | `10` | Database connections per process |
| `S3_REGION` | `us-east-1` | Signing region; must match the server's `RUSTFS_REGION` |
| `STORAGE_CORS_EXTRA_ORIGINS` | empty | Extra allowed origins for `storage:setup`, comma separated |
| `UPLOAD_MAX_FILE_SIZE_MB` | `20480` | Hard per-file limit (admins can only lower it) |
| `UPLOAD_PART_SIZE_MB` | `16` | Multipart part size (minimum 5) |
| `UPLOAD_MULTIPART_THRESHOLD_MB` | `32` | Files this size or larger use multipart |
| `UPLOAD_SESSION_TTL_HOURS` | `48` | Unfinished uploads are aborted after this |
| `ZIP_MAX_ENTRIES` | `5000` | Maximum entries per ZIP |
| `ZIP_MAX_UNCOMPRESSED_MB` | `102400` | Maximum total uncompressed size |
| `ZIP_MAX_COMPRESSION_RATIO` | `200` | Entries above this ratio are rejected as possible zip bombs |
| `SIGNED_URL_TTL_SECONDS` | `14400` | Inline preview URL lifetime |
| `DOWNLOAD_URL_TTL_SECONDS` | `300` | Download URL lifetime |
| `WORKER_CONCURRENCY` | `2` | Jobs processed at the same time per worker |
| `WORKER_POLL_INTERVAL_MS` | `2000` | Queue polling interval when idle |
| `WORKER_TMP_DIR` | OS temp dir | Scratch space; needs room for your largest file |
| `FFMPEG_PATH`, `FFPROBE_PATH`, `PDFTOPPM_PATH`, `PDFINFO_PATH` | found on `PATH` | Tool locations |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | `admin@example.com`, generated, `Platform Admin` | First admin account |
| `SEED_DEMO_USERS`, `SEED_DEMO_PASSWORD` | `false`, `Demo-Password-2026` | Demo users and campaigns (development only) |

Test-only variables are listed in [section 15](#15-testing).

---

## 12. RustFS storage setup

[RustFS](https://github.com/rustfs/rustfs) is a self-hosted object store that speaks the Amazon S3 API. The platform talks to it with the AWS SDK and presigned URLs; buckets are always addressed path-style (`https://<URL_RUSTFS host>/<bucket>/<key>`).

1. **Run RustFS** on a server you control, behind HTTPS (for example `https://files.example.com`). For production, use several disks or nodes (erasure coding) and change the default `rustfsadmin` credentials.
2. **Create a bucket** in the RustFS console (or run `npm run storage:setup -- --create`). Keep it **private**: do not add an anonymous or public bucket policy.
3. **Create an access key** with read and write access to that bucket. Put it in `ACCESS_KEY` / `SECRET_KEY`, the endpoint in `URL_RUSTFS` and the bucket in `BUCKET_NAME`, in `.env.dev` or `.env.prod`. If your server sets `RUSTFS_REGION`, set the same value in `S3_REGION`.
4. **Apply CORS**, so browsers can upload directly and read the `ETag` header that multipart uploads need:

   ```bash
   npm run storage:setup
   ```

   It allows `APP_URL` plus `STORAGE_CORS_EXTRA_ORIGINS`. The equivalent manual rule is: allowed origins = your app URL; methods `GET`, `PUT`, `HEAD`; allowed headers `content-type`, `content-length`, `range`; exposed headers `ETag`, `Content-Length`, `Content-Range`, `Accept-Ranges`. If the server refuses bucket CORS, allow the app origin on the RustFS server with `RUSTFS_CORS_ALLOWED_ORIGINS`.
5. **Optional:** enable bucket versioning or replication if you want protection against accidental deletion. The worker already aborts abandoned multipart uploads itself.
6. **Verify:** open **Settings → System status**, then upload a file and check that it reaches *Verified* integrity.

Run `storage:setup` once per environment: with `.env.dev` for development and with `NODE_ENV=production` (which loads `.env.prod`) for production. Use separate buckets for development and production.

---

## 13. Production deployment

The platform is **two processes** that share one database and one bucket:
- the **web app**: stateless, so you can run several replicas behind a load balancer;
- the **worker**: also scalable, because jobs are claimed safely and maintenance runs in one replica at a time.

### 13.1 Docker Compose (single server)

The `Dockerfile` builds one image (`creative-hub-prod`) in three stages: `deps` (`npm ci`, which also runs `prisma generate` and therefore copies `prisma/` and `prisma.config.ts`), `builder` (`npm run build`, with a placeholder `DATABASE_URL` that is only used at build time) and `runner`. The runner contains the built app, the Prisma schema and config, the worker source and the tools the worker needs (ffmpeg, poppler-utils). Its default command applies the migrations, runs the first-run bootstrap (`prisma/bootstrap.ts`) and starts the web app. The bootstrap creates the roles and, **when no admin exists**, the first admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` (without a password of at least 10 characters it prints a temporary one in the container log, to change at first sign-in). On an empty database it also adds the four platforms and the default badges. It never changes existing data, so it is safe on every start.

`docker-compose.yml` runs that image twice, with variables from `ENV_FILE` (default `.env.prod`):

| Service | Command | Role |
|---|---|---|
| `creative-hub-prod` | `npx prisma migrate deploy && npx tsx prisma/bootstrap.ts && npm run start` | Web app on port 3000 |
| `creative-hub-worker` | `npm run worker` | Background jobs: ZIP imports, thumbnails, checksums, PDF page counts, deletions |

Both join the external network `backend.prod` (where the reverse proxy and PostgreSQL live). Deploy with:

```bash
ENV_FILE=.env.prod docker compose build creative-hub-prod
```

```bash
ENV_FILE=.env.prod docker compose up -d --force-recreate --remove-orphans
```

The `Jenkinsfile` does the same with the env file stored as the Jenkins credential `creativehub_pro_env`, and runs `npx prisma migrate deploy` once before starting the containers. Tick **RUN_SEED** (*Build with Parameters*) to also run the full `npx prisma db seed`, which re-adds any missing initial platform or default badge; the first admin is already created by the bootstrap on every start. The worker's temporary folder (`WORKER_TMP_DIR`, default `/tmp`) must have room for the largest file or ZIP being processed.

Put the web container and RustFS behind HTTPS (Caddy, Nginx or Traefik) and set `TRUST_PROXY=true`.

### 13.2 Managed platforms

- **Web app:** any Node.js host (Vercel, Railway, Render, Fly.io, AWS ECS, Kubernetes). Build with `npm run build` and start with `npm run start`, or with `node server.js` from the standalone output.
- **Worker:** a long-running process with ffmpeg and poppler installed (`npm run worker`). Serverless functions are **not** suitable for the worker.
- **Database:** managed PostgreSQL (Neon, Supabase, AWS RDS, Google Cloud SQL, …). `pg_trgm` is available on all of them.
- **Storage:** a RustFS server reachable over HTTPS by the app, the worker and users' browsers.
- Provide the variables through `.env.prod` or the host's environment settings. Run `npm run db:migrate` on **every** deploy, before starting the new version.

### 13.3 Go-live checklist

1. Fill in `.env.prod` (selected by `NODE_ENV=production`): `APP_URL` as the public HTTPS URL, `DATABASE_URL`, the RustFS variables and `TRUST_PROXY=true` if behind a proxy.
2. Run `npm run db:migrate`, then `npm run db:seed` once to create the roles, applications and first admin.
3. Run `npm run storage:setup` with `NODE_ENV=production` against the production bucket.
4. Start the web app and the worker.
5. Check `/api/health` and **Settings → System status**.
6. Sign in as admin, change the password, then create users in **Team & Users**.
7. Upload a test video and its `_preview`, check that they are linked, verified and play in the browser, and run the end-to-end suite against the deployment if possible.

---

## 14. Operations and maintenance

| Task | How |
|---|---|
| Health check | `GET /api/health` returns `{"status":"ok","database":true,"storageConfigured":true}` (HTTP 503 if the database is unreachable) |
| Worker and queue status | **Settings → System status**: queued and running jobs, failures in the last 24 hours, last completed job and a stalled-queue warning. Failed jobs keep their last error in the `Job` table (`npm run db:studio`) |
| Logs | Web app: standard Next.js output. Worker: JSON lines on stdout |
| Backups | Back up PostgreSQL (point-in-time recovery recommended) and RustFS (erasure coding across disks or nodes, plus versioning or replication for protection against deletion) |
| Storage drift | **Storage → Reconcile with storage** lists orphan objects and missing originals |
| Automatic housekeeping | Expired sessions, rate-limit windows, abandoned uploads, empty creatives and old jobs are cleaned up by the worker every 5 minutes |
| Scaling | Add web replicas for traffic and worker replicas for processing. Files never pass through the web servers. The worker's temp disk must hold the largest file being processed |
| Upgrades | Deploy the new version, run `npm run db:migrate`, restart the web app and the worker |

---

## 15. Testing

```bash
npm test
```

Runs two Vitest projects:
- **unit:** filename and `_preview` parsing, the association planner, the workflow state machine, the permission matrix, ZIP safety rules and content sniffing;
- **integration:** against a **real PostgreSQL database** and a **real S3-compatible server**. It covers multipart uploads, resume, cancel, content rejection, version management, workflow history and notifications, the worker (checksum verification, thumbnails), hostile ZIP archives, authentication and rate limiting, and library search and visibility.

Integration defaults are the database `cmp_test` on localhost and S3 on `http://127.0.0.1:9000`. Override them with `TEST_DATABASE_URL`, `TEST_URL_RUSTFS`, `TEST_ACCESS_KEY`, `TEST_SECRET_KEY` and `TEST_BUCKET_NAME`. The setup creates the test bucket and sets a permissive CORS rule on it, so use a dedicated test bucket (or moto), never a shared one. Migrations are applied automatically. **Never point the test variables at production**: the integration suite empties its database.

```bash
npm run test:e2e
```

Runs Playwright against a running app (`http://localhost:3000`, or `E2E_BASE_URL`), with the worker running and demo users seeded. Set `E2E_ADMIN_PASSWORD` to your seeded admin password (the default, `ChangeMe!2026`, is CI's). It covers sign-in, role-based access, the full creative journey (upload of a full version and its preview, the preview toggle, the version selector, byte-identical download, submit, decline with reason, resubmit, approve, viewer access, activity log) and the admin screens.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, dependency audit, unit and integration tests, the production build and the end-to-end tests on every push and pull request.

The latest results are recorded in [`CHECKLIST.md`](CHECKLIST.md).

---

## 16. HTTP API reference

Pages and most mutations use Server Actions. These route handlers exist for uploads, downloads and client-side features. All of them require a signed-in session (the `cmp_session` cookie). Mutating routes also require a same-origin request.

| Method and path | Purpose | Permission | Rate limit |
|---|---|---|---|
| `POST /api/uploads/plan` | Detect version types and propose creative associations for a list of files | upload | 120/min |
| `GET /api/uploads` | List your resumable (unfinished) uploads | upload | — |
| `POST /api/uploads` | Create an upload batch (creatives + upload sessions). A file with `replaceFileId` replaces that file once it completes | upload | 30/min |
| `GET /api/uploads/:id` | Upload session status and uploaded parts | owner | — |
| `DELETE /api/uploads/:id` | Cancel (abort) an upload | owner | — |
| `POST /api/uploads/:id/parts` | Presign part URLs | owner | 1200/min |
| `POST /api/uploads/:id/complete` | Complete, validate and register the file | owner | — |
| `POST /api/imports` | Start a ZIP import upload | import | 10/min |
| `GET /api/imports/template` | Download the `data_creatives` template ZIP for your platforms | import | — |
| `GET /api/files/:id/download` | Redirect to a short-lived download URL (audited) | view | 300/min |
| `GET /api/files/:id/preview` | Redirect to an inline preview URL | view | — |
| `GET /api/search?q=` | Global search | signed in | 120/min |
| `GET /api/creatives/lookup?q=` | Find creatives to attach files to | upload | 120/min |
| `GET /api/notifications` | Recent notifications and unread count | signed in | — |
| `GET /api/activity/export` | Filtered activity log as CSV | activity | 10/min |
| `GET /api/health` | Health probe (no authentication) | public | — |

---

## 17. Development workflow

### 17.1 Branch policy: work only on `main`

- **All work is done on `main`.** Do not create feature branches and do not push to any other branch.
- Commit small, focused changes with clear messages, then push:

  ```bash
  git push origin main
  ```

- Before every push, run the checks below and make sure they pass.
- This rule also applies to AI coding agents; it is written in [`AGENTS.md`](../AGENTS.md).

### 17.2 Checks before pushing

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

Run `npm run test:e2e` as well for changes to user flows.

### 17.3 Conventions

- **Next.js 16** has breaking changes compared with older versions (`proxy.ts` instead of middleware, asynchronous `params` and `searchParams`, generated route types). Read the guides in `node_modules/next/dist/docs/` before changing framework-level code, as `AGENTS.md` requires.
- **Database changes:** edit `prisma/schema.prisma`, run `npm run db:migrate:dev -- --name <change>` to create a migration, then commit the schema and the migration together. Prisma 7 does not regenerate the client automatically after a migration; run `npx prisma generate` and restart the dev server.
- **Permissions:** add new capabilities to `src/lib/permissions.ts` and check them on the server (pages: `requirePagePermission`; actions: `requireActionUser`; routes: `apiUser`). Scope creative queries with `creativeVisibilityWhere()`.
- **Audit:** log every significant mutation with `logActivity()`.
- **Slow or binary work** (media, archives, storage clean-up) belongs in a worker job (`enqueueJob()`), not in a request.
- **Secrets** come only from environment variables (`getEnv()`); never hard-code credentials or storage URLs.
- **Originals are immutable:** never write anything back to an `originals/` key.

---

## 18. Project structure

```
prisma/
  schema.prisma          data model
  migrations/            SQL migrations (init with pg_trgm, import review fields)
  seed.ts                roles, applications, first admin, optional demo data
scripts/
  storage-setup.ts       bucket check / creation and CORS
  copy-pdfjs.mjs         copies the pdf.js worker, fonts, CMaps and decoders to public/pdfjs (git-ignored)
  demo-media.ts          sample creatives for development
src/
  proxy.ts               CSP nonce, security headers, sign-in redirect
  app/
    (auth)/              login, change-password
    (app)/               dashboard, library, creatives/[id], upload, imports/[id],
                         applications(/[id]), campaigns(/[id]), validation, approved,
                         declined, archived, team, activity, notifications, storage,
                         settings, profile
    api/                 uploads, imports, files, search, notifications,
                         creatives/lookup, activity/export, health
  components/            ui/ (shadcn), layout/, library/, creatives/, upload/,
                         imports/, charts/, team/, settings/, … 
  lib/                   env, db, auth/, permissions, visibility, workflow,
                         files/ (types, naming, matching), storage/ (s3, keys), load-env,
                         zip/safety, upload/engine (browser), rate-limit, activity, …
  server/
    actions/             Server Actions (auth, creatives, applications, campaigns,
                         users, imports, notifications, preferences, settings)
    services/            uploads, creatives (versions), validation (workflow), tags
    queries/             library, creative detail, dashboard, applications,
                         activity, system
  worker/                index.ts (runner), queue.ts, maintenance.ts, media.ts,
                         zip.ts, handlers/ (process-file, imports, reconcile)
  generated/prisma/      generated Prisma client (not committed)
tests/
  unit/                  pure logic tests
  integration/           tests against PostgreSQL + S3-compatible storage
e2e/                     Playwright specs
docs/
  DOCUMENTATION.md       this document
  ARCHITECTURE.md        architecture diagrams and design decisions
  CHECKLIST.md           requirements status and test results
Dockerfile, docker-compose.yml, .github/workflows/ci.yml, .env.dev.example, .env.prod.example
```

---

## 19. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "File storage is not configured" | `URL_RUSTFS`, `BUCKET_NAME`, `ACCESS_KEY` or `SECRET_KEY` is missing in the loaded file (`.env.dev`, or `.env.prod` when `NODE_ENV=production`). Set them and restart the web app and the worker |
| Uploads fail immediately with a network or CORS error | Bucket CORS is missing, `APP_URL` does not match the URL in the browser, or the browser cannot reach `URL_RUSTFS`. Run `npm run storage:setup` with the correct `APP_URL` (add other origins with `STORAGE_CORS_EXTRA_ORIGINS`) |
| Files stay at "Processing" with no thumbnail | The worker is not running, or ffmpeg/poppler is missing. Start `npm run worker` and check **Settings → System status** and the worker logs |
| "Integrity mismatch" on a file | The stored bytes differ from what the browser uploaded. Upload the file again; approval stays blocked until a verified version exists |
| "does not look like a valid .xxx file" | The file's content does not match its extension. Export the file again in the correct format |
| A video does not play in the browser | The codec or container is not supported by the browser (MKV, AVI, some MOV codecs). Download it, or upload an MP4/H.264 `_preview` |
| Upload says a decision is required | The file name matches several creatives or would collide with an existing full version. Choose the target creative in the dialog |
| "Too many failed sign-in attempts" | Wait 15 minutes. Behind a proxy, make sure `TRUST_PROXY=true` so users are not grouped under one IP |
| Seed printed a temporary password | `SEED_ADMIN_PASSWORD` was empty or shorter than 10 characters. Use the printed password and change it at first sign-in |
| `Unknown argument` errors after changing the schema | The Prisma client is stale. Run `npx prisma generate` and restart the dev server and the worker |
| Health check returns 503 | The database is unreachable. Check `DATABASE_URL` and the network |
| `SignatureDoesNotMatch` from storage | Wrong `SECRET_KEY`, or `S3_REGION` differs from the server's `RUSTFS_REGION` |
| Settings from `.env.dev` are ignored | A plain `.env` exists (Next.js loads it first), or the variable is already set in your shell. Remove `.env` or the shell variable |

---

## 20. Known limitations

- **Storage is verified against RustFS for development only.** The end-to-end suite passed against a RustFS server (browser uploads, previews, byte-identical downloads, worker checksums and thumbnails); the integration suite runs against an S3 emulator. Run `npm run storage:setup` and the end-to-end tests against the production RustFS bucket before going live.
- **Docker images not built yet.** They were not built in the development environment (no Docker available), although the standalone server they run was tested.
- **Browser playback depends on the codec.** MP4/H.264, WebM and most MOV files play inline; MKV, AVI and unusual codecs fall back to download or to the preview version.
- **No email.** Notifications are in-app only, and temporary passwords are shown once to the admin to share securely.
- The `shadcn` CLI, a development-only dependency, carries low-severity advisories in `deepmerge`; production dependencies audit clean.
