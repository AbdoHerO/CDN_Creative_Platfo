import { type NextRequest } from "next/server";
import { ACTIVITY_LABELS } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { apiError, apiUser } from "@/server/api-utils";
import { activityWhere, parseActivityParams } from "@/server/queries/activity";

const MAX_ROWS = 50_000;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formula injection and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** CSV export of the (filtered) activity log for audits. */
export async function GET(request: NextRequest) {
  try {
    await apiUser(request, { permission: "activity.view", rateLimit: { key: "activity-export", limit: 10, windowSeconds: 60 } });
    const params = parseActivityParams(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await prisma.activityLog.findMany({
      where: activityWhere(params),
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      include: { actor: { select: { name: true, email: true } }, application: { select: { name: true } } },
    });
    const header = ["timestamp", "user", "email", "action", "entity_type", "entity_id", "creative_id", "application", "summary", "ip_address"];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.createdAt.toISOString(),
          r.actor?.name ?? "System",
          r.actor?.email ?? "",
          ACTIVITY_LABELS[r.action],
          r.entityType,
          r.entityId,
          r.creativeId,
          r.application?.name,
          r.summary,
          r.ipAddress,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const filename = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(`﻿${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
