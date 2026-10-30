import type { NotificationType } from "@/generated/prisma/enums";
import { prisma, type Db } from "@/lib/db";

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  creativeId?: string | null;
  actorId?: string | null;
};

export async function notifyUsers(userIds: string[], input: NotificationInput, db: Db = prisma) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== input.actorId);
  if (recipients.length === 0) return 0;
  const res = await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title.slice(0, 300),
      body: input.body?.slice(0, 2000) ?? null,
      link: input.link ?? null,
      creativeId: input.creativeId ?? null,
      actorId: input.actorId ?? null,
    })),
  });
  return res.count;
}

/** Active managers and admins who can see the given application. */
export async function reviewerIdsFor(applicationId: string, db: Db = prisma): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      role: { key: { in: ["ADMIN", "MANAGER"] } },
      OR: [{ restrictApplications: false }, { applicationAccess: { some: { applicationId } } }],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
