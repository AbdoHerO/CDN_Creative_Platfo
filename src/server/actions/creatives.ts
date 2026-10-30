"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Channel, CreativeCategory, VersionType } from "@/generated/prisma/enums";
import { getRequestMeta, requireActionUser } from "@/lib/auth/current-user";
import { STATUS_LABELS } from "@/lib/constants";
import { WORKFLOW, type WorkflowAction } from "@/lib/workflow";
import { parseInput, runAction } from "@/server/action-utils";
import { deleteCreative, deleteFile, moveFile, setCurrentFile, updateCreativeMetadata } from "@/server/services/creatives";
import { submitCreatives, transitionCreative } from "@/server/services/validation";

const id = z.string().min(1).max(64);

function revalidateCreative(creativeId?: string) {
  if (creativeId) revalidatePath(`/creatives/${creativeId}`);
  for (const path of ["/library", "/validation", "/approved", "/declined", "/archived", "/dashboard"]) revalidatePath(path);
}

const metadataSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  description: z.string().max(5000).nullish(),
  campaignId: z.string().max(64).nullish(),
  category: z.enum(CreativeCategory),
  channels: z.array(z.enum(Channel)).max(20),
  keywords: z.array(z.string().max(60)).max(50),
  tags: z.array(z.string().max(40)).max(30),
});

export async function updateCreativeAction(creativeId: string, input: z.input<typeof metadataSchema>) {
  return runAction(async () => {
    const user = await requireActionUser();
    const data = parseInput(metadataSchema, input);
    await updateCreativeMetadata(user, parseInput(id, creativeId), data, await getRequestMeta());
    revalidateCreative(creativeId);
    return true;
  }, "Creative updated.");
}

const workflowSchema = z.object({
  action: z.enum(Object.keys(WORKFLOW) as [WorkflowAction, ...WorkflowAction[]]),
  comment: z.string().max(5000).nullish(),
});

export async function transitionCreativeAction(creativeId: string, input: z.input<typeof workflowSchema>) {
  const result = await runAction(async () => {
    const user = await requireActionUser();
    const data = parseInput(workflowSchema, input);
    const res = await transitionCreative(user, parseInput(id, creativeId), data.action, { comment: data.comment }, await getRequestMeta());
    revalidateCreative(creativeId);
    return res;
  });
  if (result.ok) result.message = `Status changed to ${STATUS_LABELS[result.data.status]}.`;
  return result;
}

/** Library edit mode: submit every selected draft (or declined creative) for validation. */
export async function bulkSubmitAction(creativeIds: string[]) {
  const result = await runAction(async () => {
    const user = await requireActionUser();
    const ids = parseInput(z.array(id).min(1).max(500), creativeIds);
    const res = await submitCreatives(user, ids, await getRequestMeta());
    revalidateCreative();
    return res;
  });
  if (result.ok) {
    const { submitted, skipped } = result.data;
    result.message = `${submitted} creative${submitted === 1 ? "" : "s"} submitted for validation${skipped ? ` (${skipped} skipped)` : ""}.`;
  }
  return result;
}

export async function deleteCreativeAction(creativeId: string) {
  return runAction(async () => {
    const user = await requireActionUser();
    const res = await deleteCreative(user, parseInput(id, creativeId), await getRequestMeta());
    revalidateCreative();
    return res;
  }, "Creative deleted.");
}

export async function deleteFileAction(fileId: string, creativeId: string) {
  return runAction(async () => {
    const user = await requireActionUser();
    await deleteFile(user, parseInput(id, fileId), await getRequestMeta());
    revalidateCreative(creativeId);
    return true;
  }, "Version deleted.");
}

export async function setCurrentFileAction(fileId: string, creativeId: string) {
  return runAction(async () => {
    const user = await requireActionUser();
    await setCurrentFile(user, parseInput(id, fileId), await getRequestMeta());
    revalidateCreative(creativeId);
    return true;
  }, "Current version updated.");
}

const moveSchema = z.object({ targetCreativeId: id, versionType: z.enum(VersionType).optional() });

export async function moveFileAction(fileId: string, input: z.input<typeof moveSchema>) {
  return runAction(async () => {
    const user = await requireActionUser();
    const data = parseInput(moveSchema, input);
    const res = await moveFile(user, parseInput(id, fileId), data.targetCreativeId, data.versionType, await getRequestMeta());
    revalidateCreative(data.targetCreativeId);
    return res;
  }, "File linked.");
}
