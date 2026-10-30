import type { JobType } from "@/generated/prisma/enums";
import { prisma, type Db } from "@/lib/db";

/** Job payloads understood by the worker (src/worker). */
export type JobPayloads = {
  PROCESS_FILE: { fileId: string };
  DELETE_OBJECTS: { keys: string[]; reason?: string };
  ANALYZE_IMPORT: { batchId: string };
  RUN_IMPORT: { batchId: string };
  RECONCILE_STORAGE: { snapshotId: string };
  MAKE_STREAM: { fileId: string };
};

export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  opts: { db?: Db; runAt?: Date; maxAttempts?: number } = {},
) {
  const db = opts.db ?? prisma;
  return db.job.create({
    data: {
      type,
      payload,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
}
