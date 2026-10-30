/**
 * Development helper: `npm run demo:media`
 *
 * Generates genuine sample media (ffmpeg test videos with matching `_preview`
 * files, banner images, a PDF) and registers them through the real services:
 * objects are uploaded to the configured bucket, versions are attached, the
 * worker processes them, and a few creatives are moved through the validation
 * workflow. Nothing is simulated — it is equivalent to uploading by hand.
 *
 * Requires: configured storage, ffmpeg, a seeded admin, and the worker running
 * to generate thumbnails. Refuses to run with NODE_ENV=production.
 */
import "../src/lib/load-env";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { CreativeCategory, VersionType } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db";
import { getEnv, isStorageConfigured } from "../src/lib/env";
import { parseFilename } from "../src/lib/files/naming";
import { fileTypeForName } from "../src/lib/files/types";
import { newId } from "../src/lib/ids";
import { originalKey } from "../src/lib/storage/keys";
import { putObject } from "../src/lib/storage/s3";
import { attachFile, createCreativeRecord } from "../src/server/services/creatives";
import { transitionCreative } from "../src/server/services/validation";

const run = promisify(execFile);

type Plan = {
  name: string;
  category: CreativeCategory;
  files: { filename: string; make: (dir: string, color: string, label: string) => Promise<string> }[];
  workflow?: ("submit" | "approve" | "decline")[];
  tags: string[];
};

async function video(dir: string, filename: string, seconds: number, size: string, bitrate: string, color: string) {
  const out = join(dir, filename);
  await run(getEnv().FFMPEG_PATH, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=25`,
    "-f", "lavfi", "-i", `color=c=${color.replace("#", "0x")}:size=${size}:rate=25`,
    "-f", "lavfi", "-i", "sine=frequency=330",
    "-filter_complex", "[0:v][1:v]blend=all_mode=overlay:all_opacity=0.45[v]",
    "-map", "[v]", "-map", "2:a", "-t", String(seconds),
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", bitrate, "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
  ]);
  return out;
}

async function banner(dir: string, filename: string, width: number, height: number, color: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="${color}"/>
    <circle cx="${width * 0.82}" cy="${height * 0.3}" r="${height * 0.45}" fill="#ffffff" fill-opacity="0.12"/>
    <text x="${width * 0.06}" y="${height * 0.55}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(height * 0.14)}" font-weight="700" fill="#ffffff">${label}</text>
  </svg>`;
  const out = join(dir, filename);
  const format = filename.endsWith(".jpg") ? "jpeg" : "png";
  await sharp(Buffer.from(svg))[format]().toFile(out);
  return out;
}

async function pdf(dir: string, filename: string, label: string) {
  const text = `BT /F1 28 Tf 72 720 Td (${label.replace(/[()\\]/g, "")}) Tj ET`;
  const body = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${text.length}>>stream\n${text}\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
  const out = join(dir, filename);
  await writeFile(out, body);
  return out;
}

const PLANS: Plan[] = [
  {
    name: "Spring promo video",
    category: "ADVERTISING_VIDEO",
    tags: ["promotion", "social"],
    workflow: ["submit", "approve"],
    files: [
      { filename: "spring_promo.mp4", make: (d, c) => video(d, "spring_promo.mp4", 8, "1920x1080", "8M", c) },
      { filename: "spring_promo_preview.mp4", make: (d, c) => video(d, "spring_promo_preview.mp4", 8, "640x360", "600k", c) },
    ],
  },
  {
    name: "Product launch teaser",
    category: "MARKETING_VIDEO",
    tags: ["launch"],
    workflow: ["submit"],
    files: [
      { filename: "product_launch_teaser.mp4", make: (d, c) => video(d, "product_launch_teaser.mp4", 6, "1280x720", "5M", c) },
      { filename: "product_launch_teaser_preview.mp4", make: (d, c) => video(d, "product_launch_teaser_preview.mp4", 6, "480x270", "400k", c) },
    ],
  },
  {
    name: "Homepage hero banner",
    category: "BANNER",
    tags: ["awareness"],
    workflow: ["submit", "decline"],
    files: [{ filename: "homepage_hero_banner.png", make: (d, c, l) => banner(d, "homepage_hero_banner.png", 1920, 600, c, l) }],
  },
  {
    name: "Instagram square post",
    category: "SOCIAL_MEDIA_POST",
    tags: ["social"],
    files: [{ filename: "instagram_square_post.jpg", make: (d, c, l) => banner(d, "instagram_square_post.jpg", 1080, 1080, c, l) }],
  },
  {
    name: "Partner brochure",
    category: "CAMPAIGN_VISUAL",
    tags: ["b2b"],
    workflow: ["submit", "approve"],
    files: [{ filename: "partner_brochure.pdf", make: (d, _c, l) => pdf(d, "partner_brochure.pdf", `${l} partner brochure`) }],
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("demo:media is a development tool.");
  if (!isStorageConfigured()) throw new Error("Configure storage (URL_RUSTFS, BUCKET_NAME, ACCESS_KEY, SECRET_KEY) first.");
  const admin = await prisma.user.findFirst({ where: { role: { key: "ADMIN" }, status: "ACTIVE" }, include: { role: true } });
  if (!admin) throw new Error("Seed the database first (npm run db:seed).");
  const actor = { id: admin.id, name: admin.name, role: admin.role.key, restrictApplications: false, applicationIds: [] as string[] };
  const creator = await prisma.user.findFirst({ where: { role: { key: "CREATOR" }, status: "ACTIVE" } });
  const apps = await prisma.application.findMany({ where: { status: "ACTIVE" }, include: { campaigns: { take: 1, orderBy: { createdAt: "asc" } } } });
  const dir = await mkdtemp(join(tmpdir(), "cmp-demo-"));
  let count = 0;
  try {
    for (const app of apps) {
      for (const plan of PLANS) {
        const name = `${app.name} — ${plan.name}`;
        if (await prisma.creative.findFirst({ where: { applicationId: app.id, name } })) continue;
        const ownerId = creator?.id ?? admin.id;
        const first = parseFilename(plan.files[0].filename);
        const creative = await prisma.$transaction((tx) =>
          createCreativeRecord(tx, {
            name,
            applicationId: app.id,
            campaignId: app.campaigns[0]?.id ?? null,
            category: plan.category,
            description: `Sample ${plan.name.toLowerCase()} for ${app.name}, generated by the demo script.`,
            tags: plan.tags,
            channels: ["INSTAGRAM", "FACEBOOK"],
            matchKey: first.matchKey,
            mediaType: fileTypeForName(plan.files[0].filename)!.mediaType,
            createdById: ownerId,
          }),
        );
        for (const f of plan.files) {
          const path = await f.make(dir, app.brandColor, app.name);
          const bytes = await readFile(path);
          const def = fileTypeForName(f.filename)!;
          const fileId = newId();
          const key = originalKey(app.id, creative.id, fileId, f.filename);
          await putObject(key, bytes, def.mime);
          const parsed = parseFilename(f.filename);
          await prisma.$transaction((tx) =>
            attachFile(
              tx,
              {
                fileId,
                creativeId: creative.id,
                versionType: parsed.detectedVersionType as VersionType,
                originalFilename: f.filename,
                storageKey: key,
                sizeBytes: BigInt(bytes.length),
                mimeType: def.mime,
                extension: parsed.extension,
                mediaType: def.mediaType,
                checksumSha256: createHash("sha256").update(bytes).digest("hex"),
                uploadedById: ownerId,
              },
              { id: ownerId, name: creator?.name ?? admin.name },
            ),
          );
        }
        for (const step of plan.workflow ?? []) {
          await transitionCreative(actor, creative.id, step, { comment: step === "decline" ? "Logo is outdated and the legal mention is missing." : null });
        }
        count++;
        console.log(`✔ ${name}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`Done: ${count} creative(s) created. Keep the worker running to generate thumbnails and verify checksums.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
