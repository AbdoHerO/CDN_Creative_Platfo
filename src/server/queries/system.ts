import "server-only";
import { prisma } from "@/lib/db";

/** Queue depth and liveness of the background worker, derived from the job table. */
export async function getWorkerHealth() {
  const now = Date.now();
  const [queued, failed24h, lastDone, oldestDue] = await Promise.all([
    prisma.job.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }),
    prisma.job.count({ where: { status: "FAILED", updatedAt: { gt: new Date(now - 86_400_000) } } }),
    prisma.job.findFirst({ where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
    prisma.job.findFirst({ where: { status: "QUEUED", runAt: { lte: new Date(now) } }, orderBy: { runAt: "asc" }, select: { runAt: true } }),
  ]);
  return {
    queued,
    failed24h,
    lastCompletedAt: lastDone?.completedAt ?? null,
    // A due job waiting more than five minutes means no worker is consuming the queue.
    stalled: !!oldestDue && now - oldestDue.runAt.getTime() > 5 * 60_000,
  };
}
