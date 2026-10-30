import type { JobType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";

export type ClaimedJob = {
  id: string;
  type: JobType;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

/** Atomically claim the next due job. Safe with any number of workers. */
export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job"
       SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId},
           "attempts" = "attempts" + 1, "updatedAt" = now()
     WHERE "id" = (
       SELECT "id" FROM "Job"
        WHERE "status" = 'QUEUED' AND "runAt" <= now()
        ORDER BY "runAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
  RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
  return rows[0] ?? null;
}

/** Runs on a timer: a failed heartbeat is logged, never allowed to crash the worker. */
export async function heartbeat(jobId: string) {
  try {
    await prisma.job.updateMany({ where: { id: jobId }, data: { lockedAt: new Date() } });
  } catch (err) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), level: "warn", msg: "heartbeat failed", jobId, error: String(err) }));
  }
}

export async function completeJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
  });
}

/** Retry with exponential backoff, or mark FAILED when attempts are exhausted. */
export async function failJob(job: ClaimedJob, error: unknown): Promise<"retry" | "failed"> {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 2000);
  if (job.attempts >= job.maxAttempts) {
    await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", lastError: message, lockedAt: null, lockedBy: null } });
    return "failed";
  }
  const delayMs = Math.min(30 * 60_000, 15_000 * 2 ** (job.attempts - 1));
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "QUEUED", runAt: new Date(Date.now() + delayMs), lastError: message, lockedAt: null, lockedBy: null },
  });
  return "retry";
}

/** Re-queue jobs whose worker died (no heartbeat for 5 minutes). */
export async function recoverStaleJobs() {
  const res = await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: "QUEUED", lockedAt: null, lockedBy: null, lastError: "Recovered after worker interruption" },
  });
  return res.count;
}
