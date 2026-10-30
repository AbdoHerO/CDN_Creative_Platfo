import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import type { RoleKey } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/auth/session-core";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { getObjectStream } from "@/lib/storage/r2";
import type { BatchSessionInfo } from "@/server/services/uploads";
import { getUploadStatus, presignParts } from "@/server/services/uploads";

const run = promisify(execFile);

/** Remove all rows (keeps the migrated schema). */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

export type World = {
  apps: { alpha: string; beta: string };
  users: Record<"admin" | "manager" | "creator" | "creator2" | "viewer" | "restricted", SessionUser>;
};

let passwordHash: string | null = null;

/** Roles, two applications and one user per role (plus a restricted creator). */
export async function seedWorld(): Promise<World> {
  passwordHash ??= await hashPassword("Test-Password-123");
  const roles: Record<string, string> = {};
  for (const key of ["ADMIN", "MANAGER", "CREATOR", "VIEWER"] as RoleKey[]) {
    roles[key] = (await prisma.role.create({ data: { key, name: key } })).id;
  }
  const alpha = await prisma.application.create({ data: { name: "Alpha", slug: "alpha", brandColor: "#2563EB" } });
  const beta = await prisma.application.create({ data: { name: "Beta", slug: "beta", brandColor: "#16A34A" } });
  const make = async (key: string, role: RoleKey, restrict?: string[]): Promise<SessionUser> => {
    const u = await prisma.user.create({
      data: {
        email: `${key}@test.local`,
        name: `${key[0].toUpperCase()}${key.slice(1)} User`,
        passwordHash: passwordHash!,
        roleId: roles[role],
        restrictApplications: !!restrict,
        applicationAccess: restrict ? { create: restrict.map((applicationId) => ({ applicationId })) } : undefined,
      },
    });
    return {
      id: u.id,
      sessionId: `session-${key}`,
      email: u.email,
      name: u.name,
      jobTitle: null,
      role,
      status: "ACTIVE",
      mustChangePassword: false,
      showPreviewVersions: false,
      libraryView: "GRID",
      restrictApplications: !!restrict,
      applicationIds: restrict ?? [],
    };
  };
  return {
    apps: { alpha: alpha.id, beta: beta.id },
    users: {
      admin: await make("admin", "ADMIN"),
      manager: await make("manager", "MANAGER"),
      creator: await make("creator", "CREATOR"),
      creator2: await make("creator2", "CREATOR"),
      viewer: await make("viewer", "VIEWER"),
      restricted: await make("restricted", "CREATOR", [alpha.id]),
    },
  };
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export async function pngBytes(width = 64, height = 48, color = "#ff3366") {
  return sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
}

/** A real (tiny) H.264 MP4 produced by ffmpeg. */
export async function mp4Bytes(seconds = 1, size = "160x90"): Promise<Buffer> {
  const { stdout } = await run(
    process.env.FFMPEG_PATH ?? "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=10`, "-t", String(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  );
  return stdout as unknown as Buffer;
}

/** Deterministic pseudo-random payload (incompressible). */
export function randomBytesOf(size: number, seed = 1) {
  const out = Buffer.alloc(size);
  let x = seed;
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

/** Upload bytes exactly as the browser engine does (presigned PUTs, no app server in between). */
export async function uploadThroughSession(user: SessionUser, session: BatchSessionInfo, bytes: Uint8Array, opts: { onlyParts?: number[] } = {}) {
  if (session.mode === "SINGLE") {
    const res = await fetch(session.singleUrl!, { method: "PUT", body: new Uint8Array(bytes), headers: { "Content-Type": session.mimeType } });
    if (!res.ok) throw new Error(`PUT failed ${res.status}: ${await res.text()}`);
    return;
  }
  const partSize = session.partSize!;
  const numbers = opts.onlyParts ?? Array.from({ length: session.partCount! }, (_, i) => i + 1);
  const { parts } = await presignParts(user, session.sessionId, numbers);
  for (const p of parts) {
    const chunk = bytes.subarray((p.partNumber - 1) * partSize, Math.min(bytes.length, p.partNumber * partSize));
    const res = await fetch(p.url, { method: "PUT", body: new Uint8Array(chunk) });
    if (!res.ok) throw new Error(`Part ${p.partNumber} failed ${res.status}`);
  }
  await getUploadStatus(user, session.sessionId);
}

export async function readObject(key: string): Promise<Buffer> {
  const stream = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
