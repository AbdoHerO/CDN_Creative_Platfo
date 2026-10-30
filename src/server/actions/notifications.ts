"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { parseInput, runAction } from "@/server/action-utils";

const idsSchema = z.array(z.string().min(1).max(64)).max(500);

export async function markNotificationsReadAction(ids: string[] | "all") {
  return runAction(async () => {
    const user = await requireActionUser();
    const where = ids === "all" ? { userId: user.id, readAt: null } : { userId: user.id, id: { in: parseInput(idsSchema, ids) } };
    const res = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
    revalidatePath("/notifications");
    return res.count;
  });
}

export async function markNotificationUnreadAction(id: string) {
  return runAction(async () => {
    const user = await requireActionUser();
    await prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: null } });
    revalidatePath("/notifications");
    return true;
  });
}

export async function deleteReadNotificationsAction() {
  return runAction(async () => {
    const user = await requireActionUser();
    const res = await prisma.notification.deleteMany({ where: { userId: user.id, readAt: { not: null } } });
    revalidatePath("/notifications");
    return res.count;
  }, "Cleared read notifications.");
}
