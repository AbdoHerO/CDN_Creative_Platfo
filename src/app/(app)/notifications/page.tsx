import { BellOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { UrlPagination } from "@/components/common/url-pagination";
import { NotificationBulkActions, NotificationReadToggle } from "@/components/notifications/notification-controls";
import { NotificationIcon } from "@/components/notifications/notification-icon";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

const PAGE_SIZE = 30;

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = sp.filter === "unread" ? "unread" : "all";
  const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1);
  const where = { userId: user.id, ...(filter === "unread" ? { readAt: null } : {}) };
  const [total, unread, read, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.count({ where: { userId: user.id, readAt: { not: null } } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="Notifications" description="Approvals, declines, requested changes, new submissions and background job results." actions={<NotificationBulkActions unread={unread} read={read} />} />
      <div className="mb-4 inline-flex rounded-lg border bg-card p-0.5">
        {(["all", "unread"] as const).map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/notifications" : "/notifications?filter=unread"}
            className={cn("rounded-md px-3 py-1.5 text-sm", filter === f ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {f === "all" ? "All" : `Unread (${unread})`}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={BellOff} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} description="You will be notified about validation decisions and submissions that concern you." />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {items.map((n) => (
            <li key={n.id} className={cn("flex gap-3 px-4 py-3.5", !n.readAt && "bg-accent/30")}>
              <NotificationIcon type={n.type} />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link href={n.link} className="text-sm font-medium hover:text-primary">
                    {n.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium">{n.title}</p>
                )}
                {n.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(n.createdAt)}>
                  {timeAgo(n.createdAt)}
                  {n.actor ? ` · by ${n.actor.name}` : ""}
                </p>
              </div>
              <NotificationReadToggle id={n.id} read={!!n.readAt} />
            </li>
          ))}
        </ul>
      )}
      <UrlPagination basePath="/notifications" params={{ filter: filter === "unread" ? "unread" : undefined }} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  );
}
