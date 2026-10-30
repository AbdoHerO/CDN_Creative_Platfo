"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { parseInput, runAction } from "@/server/action-utils";

const schema = z.object({
  showPreviewVersions: z.boolean().optional(),
  libraryView: z.enum(["GRID", "LIST"]).optional(),
});

export async function updatePreferencesAction(input: z.input<typeof schema>) {
  return runAction(async () => {
    const user = await requireActionUser();
    const data = parseInput(schema, input);
    await prisma.user.update({ where: { id: user.id }, data });
    revalidatePath("/", "layout");
    return true;
  });
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(100),
  jobTitle: z.string().trim().max(100).nullish(),
});

export async function updateProfileAction(input: z.input<typeof profileSchema>) {
  return runAction(async () => {
    const user = await requireActionUser();
    const data = parseInput(profileSchema, input);
    await prisma.user.update({ where: { id: user.id }, data: { name: data.name, jobTitle: data.jobTitle || null } });
    revalidatePath("/", "layout");
    return true;
  }, "Profile updated.");
}
