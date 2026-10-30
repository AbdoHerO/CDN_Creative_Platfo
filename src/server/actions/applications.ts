"use server";

import { fileTypeFromBuffer } from "file-type";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { sniffMatches, fileTypeForName } from "@/lib/files/types";
import { enqueueJob } from "@/lib/jobs";
import { applicationLogoKey } from "@/lib/storage/keys";
import { putObject } from "@/lib/storage/s3";
import { parseInput, runAction } from "@/server/action-utils";
import { uniqueApplicationSlug } from "@/server/services/applications";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80),
  description: z.string().trim().max(1000).nullish(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #2563EB."),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

function revalidateApps(id?: string) {
  revalidatePath("/applications");
  if (id) revalidatePath(`/applications/${id}`);
  revalidatePath("/dashboard");
}

export async function createApplicationAction(input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await requireActionUser("application.manage");
    const data = parseInput(schema, input);
    if (await prisma.application.findUnique({ where: { name: data.name } })) {
      throw new AppError("An application with this name already exists.", 409, { name: "Name already in use." });
    }
    const maxOrder = await prisma.application.aggregate({ _max: { sortOrder: true } });
    const app = await prisma.application.create({
      data: {
        name: data.name,
        slug: await uniqueApplicationSlug(prisma, data.name),
        description: data.description || null,
        brandColor: data.brandColor.toUpperCase(),
        sortOrder: data.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    await logActivity({
      actorId: user.id,
      action: "APPLICATION_CREATED",
      entityType: "APPLICATION",
      entityId: app.id,
      applicationId: app.id,
      summary: `${user.name} created application ${app.name}`,
      meta: await getRequestMeta(),
    });
    revalidateApps();
    return { id: app.id };
  }, "Application created.");
}

export async function updateApplicationAction(id: string, input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await requireActionUser("application.manage");
    const data = parseInput(schema, input);
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundError();
    const clash = await prisma.application.findUnique({ where: { name: data.name } });
    if (clash && clash.id !== id) throw new AppError("An application with this name already exists.", 409, { name: "Name already in use." });
    await prisma.application.update({
      where: { id },
      data: {
        name: data.name,
        slug: app.name === data.name ? app.slug : await uniqueApplicationSlug(prisma, data.name, id),
        description: data.description || null,
        brandColor: data.brandColor.toUpperCase(),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
    await logActivity({
      actorId: user.id,
      action: "APPLICATION_UPDATED",
      entityType: "APPLICATION",
      entityId: id,
      applicationId: id,
      summary: `${user.name} updated application ${data.name}`,
      meta: await getRequestMeta(),
    });
    revalidateApps(id);
    return true;
  }, "Application updated.");
}

export async function setApplicationStatusAction(id: string, status: "ACTIVE" | "DISABLED") {
  return runAction(async () => {
    const user = await requireActionUser("application.manage");
    const app = await prisma.application.update({ where: { id }, data: { status: z.enum(["ACTIVE", "DISABLED"]).parse(status) } });
    await logActivity({
      actorId: user.id,
      action: "APPLICATION_STATUS_CHANGED",
      entityType: "APPLICATION",
      entityId: id,
      applicationId: id,
      summary: `${user.name} ${status === "ACTIVE" ? "enabled" : "disabled"} application ${app.name}`,
      meta: await getRequestMeta(),
    });
    revalidateApps(id);
    return true;
  }, status === "ACTIVE" ? "Application enabled." : "Application disabled. It no longer accepts uploads.");
}

const LOGO_TYPES = ["png", "jpg", "jpeg", "webp", "svg"];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Logos are small branding images uploaded through the server and validated by content. */
export async function uploadApplicationLogoAction(id: string, formData: FormData) {
  return runAction(async () => {
    const user = await requireActionUser("application.manage");
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundError();
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose an image file.", 422);
    if (file.size > MAX_LOGO_BYTES) throw new AppError("Logos must be 2 MB or smaller.", 422);
    const def = fileTypeForName(file.name);
    const ext = def?.extensions[0];
    if (!def || !ext || !LOGO_TYPES.includes(ext)) throw new AppError("Use a PNG, JPG, WebP or SVG image.", 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = await fileTypeFromBuffer(bytes);
    if (!sniffMatches(def, detected?.mime, bytes)) throw new AppError("The file content does not match its extension.", 422);
    const key = applicationLogoKey(id, ext);
    await putObject(key, bytes, def.mime, "private, max-age=31536000, immutable");
    await prisma.application.update({ where: { id }, data: { logoKey: key, logoMimeType: def.mime } });
    if (app.logoKey) await enqueueJob("DELETE_OBJECTS", { keys: [app.logoKey], reason: "logo replaced" });
    await logActivity({
      actorId: user.id,
      action: "APPLICATION_UPDATED",
      entityType: "APPLICATION",
      entityId: id,
      applicationId: id,
      summary: `${user.name} updated the logo of ${app.name}`,
      meta: await getRequestMeta(),
    });
    revalidateApps(id);
    return true;
  }, "Logo updated.");
}

export async function removeApplicationLogoAction(id: string) {
  return runAction(async () => {
    await requireActionUser("application.manage");
    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) throw new NotFoundError();
    await prisma.application.update({ where: { id }, data: { logoKey: null, logoMimeType: null } });
    if (app.logoKey) await enqueueJob("DELETE_OBJECTS", { keys: [app.logoKey], reason: "logo removed" });
    revalidateApps(id);
    return true;
  }, "Logo removed.");
}
