import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";

/** Latest notifications + unread count for the top-bar bell (polled). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const [unread, items] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);
  return NextResponse.json(
    { unread, items: items.map((n) => ({ ...n, actorName: n.actor?.name ?? null, actor: undefined })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
