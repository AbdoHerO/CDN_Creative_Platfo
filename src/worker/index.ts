/**
 * Background worker: `npm run worker`.
 *
 * Consumes the Postgres job queue (thumbnails, metadata, checksum verification,
 * ZIP analysis/extraction, object deletion, storage reconciliation) and runs
 * periodic maintenance. Run one or more replicas next to the web app.
 */
import "@/lib/load-env";
import { hostname } from "node:os";
import { prisma } from "@/lib/db";
import { getEnv, isStorageConfigured } from "@/lib/env";
import type { JobPayloads } from "@/lib/jobs";
import { deleteObjects } from "@/lib/storage/s3";
import { analyzeImport, importFailed, runImport } from "./handlers/imports";
import { processFile, processFileFailed } from "./handlers/process-file";
import { reconcileFailed, reconcileStorage } from "./handlers/reconcile";
import { log } from "./log";
import { runMaintenance } from "./maintenance";
import { claimJob, completeJob, failJob, heartbeat, recoverStaleJobs, type ClaimedJob } from "./queue";

type Handler<T> = { run: (payload: T) => Promise<void>; onFinalFailure?: (payload: T, error: unknown) => Promise<void> };

const handlers: { [K in keyof JobPayloads]: Handler<JobPayloads[K]> } = {
  PROCESS_FILE: { run: processFile, onFinalFailure: processFileFailed },
  DELETE_OBJECTS: { run: async (p) => deleteObjects(p.keys) },
  ANALYZE_IMPORT: { run: analyzeImport, onFinalFailure: importFailed },
  RUN_IMPORT: { run: runImport, onFinalFailure: importFailed },
  RECONCILE_STORAGE: { run: reconcileStorage, onFinalFailure: reconcileFailed },
};

const workerId = `${hostname()}:${process.pid}`;
let stopping = false;
const running = new Set<Promise<void>>();

async function execute(job: ClaimedJob) {
  const handler = handlers[job.type] as Handler<unknown>;
  const beat = setInterval(() => void heartbeat(job.id), 60_000);
  const started = Date.now();
  try {
    await handler.run(job.payload);
    await completeJob(job.id);
    log.info("job completed", { id: job.id, type: job.type, ms: Date.now() - started });
  } catch (err) {
    const outcome = await failJob(job, err);
    log.error("job failed", { id: job.id, type: job.type, attempt: job.attempts, outcome, error: err instanceof Error ? err.message : String(err) });
    if (outcome === "failed" && handler.onFinalFailure) {
      await handler.onFinalFailure(job.payload, err).catch((e) => log.error("final failure handler errored", { error: String(e) }));
    }
  } finally {
    clearInterval(beat);
  }
}

async function loop(slot: number) {
  const { WORKER_POLL_INTERVAL_MS } = getEnv();
  while (!stopping) {
    let job: ClaimedJob | null = null;
    try {
      job = await claimJob(`${workerId}#${slot}`);
    } catch (err) {
      log.error("claim failed", { error: String(err) });
    }
    if (!job) {
      await new Promise((r) => setTimeout(r, WORKER_POLL_INTERVAL_MS));
      continue;
    }
    const p = execute(job);
    running.add(p);
    await p;
    running.delete(p);
  }
}

async function main() {
  const env = getEnv();
  if (!isStorageConfigured()) {
    log.warn("Storage is not configured: file jobs will fail until URL_RUSTFS, BUCKET_NAME, ACCESS_KEY and SECRET_KEY are set.");
  }
  log.info("worker started", { workerId, concurrency: env.WORKER_CONCURRENCY });

  const maintenance = async () => {
    try {
      const recovered = await recoverStaleJobs();
      if (recovered) log.warn("recovered stale jobs", { recovered });
      await runMaintenance();
    } catch (err) {
      log.error("maintenance failed", { error: String(err) });
    }
  };
  await maintenance();
  const timer = setInterval(maintenance, 5 * 60_000);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    log.info("shutting down", { signal, running: running.size });
    await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, 60_000))]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await Promise.all(Array.from({ length: env.WORKER_CONCURRENCY }, (_, i) => loop(i)));
}

void main().catch((err) => {
  log.error("worker crashed", { error: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
