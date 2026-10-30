"use client";

import { History, Play, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes, timeAgo } from "@/lib/format";
import { cancelUpload, fileFingerprint, isAbort, uploadFile, type UploadSessionInfo } from "@/lib/upload/engine";

type Resumable = {
  id: string;
  filename: string;
  sizeBytes: number;
  fingerprint: string;
  createdAt: string;
  creativeId: string | null;
  creativeName: string | null;
  applicationName: string | null;
};

type RunState = { progress: number; status: "running" | "done" | "error"; error?: string; creativeId?: string };

/**
 * Uploads interrupted by a closed tab, crash or network loss. Selecting the same
 * local file again resumes from the parts already stored in the bucket.
 */
export function InterruptedUploads({ disabled }: { disabled?: boolean }) {
  const [uploads, setUploads] = useState<Resumable[]>([]);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const pickFor = useRef<Resumable | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/uploads", { cache: "no-store" });
      if (res.ok) setUploads(((await res.json()) as { uploads: Resumable[] }).uploads);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resume = async (upload: Resumable, file: File) => {
    if (fileFingerprint(file) !== upload.fingerprint) {
      toast.error(`That is not the same file. Select “${upload.filename}” (${formatBytes(upload.sizeBytes)}).`);
      return;
    }
    const ctrl = new AbortController();
    controllers.current.set(upload.id, ctrl);
    setRuns((r) => ({ ...r, [upload.id]: { progress: 0, status: "running" } }));
    try {
      const statusRes = await fetch(`/api/uploads/${upload.id}`);
      const status = (await statusRes.json()) as UploadSessionInfo & { error?: string; status: string };
      if (!statusRes.ok) throw new Error(status.error ?? "Upload is no longer available.");
      const result = await uploadFile(
        file,
        { sessionId: upload.id, mode: status.mode, partSize: status.partSize, partCount: status.partCount, mimeType: status.mimeType, singleUrl: null },
        {
          signal: ctrl.signal,
          onProgress: (p) => setRuns((r) => ({ ...r, [upload.id]: { progress: Math.round((p.uploadedBytes / p.totalBytes) * 100), status: "running" } })),
        },
      );
      setRuns((r) => ({ ...r, [upload.id]: { progress: 100, status: "done", creativeId: result.kind === "file" ? result.creativeId : undefined } }));
      toast.success(`${upload.filename} uploaded.`);
    } catch (err) {
      if (isAbort(err)) return;
      setRuns((r) => ({ ...r, [upload.id]: { progress: r[upload.id]?.progress ?? 0, status: "error", error: err instanceof Error ? err.message : "Failed" } }));
    } finally {
      controllers.current.delete(upload.id);
    }
  };

  const discard = async (upload: Resumable) => {
    controllers.current.get(upload.id)?.abort();
    await cancelUpload(upload.id);
    setUploads((u) => u.filter((x) => x.id !== upload.id));
    toast.success("Upload discarded.");
  };

  if (uploads.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/25 dark:bg-amber-500/5">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
        <History className="size-4" /> Interrupted uploads
        <span className="font-normal text-amber-800/80 dark:text-amber-200/80">— select the same file again to resume where it stopped.</span>
      </div>
      <ul className="space-y-2">
        {uploads.map((u) => {
          const run = runs[u.id];
          return (
            <li key={u.id} className="rounded-lg border bg-card px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.filename}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatBytes(u.sizeBytes)} · {u.creativeName ?? "Creative"} · {u.applicationName} · started {timeAgo(u.createdAt)}
                  </p>
                  {run?.status === "error" && <p className="text-xs text-destructive">{run.error}</p>}
                </div>
                {run?.status === "done" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/creatives/${run.creativeId ?? u.creativeId}`}>Open</Link>
                  </Button>
                ) : run?.status === "running" ? (
                  <Button size="sm" variant="ghost" onClick={() => controllers.current.get(u.id)?.abort()}>
                    Pause
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        pickFor.current = u;
                        inputRef.current?.click();
                      }}
                    >
                      <Play /> Resume
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => discard(u)} aria-label={`Discard ${u.filename}`}>
                      <X />
                    </Button>
                  </>
                )}
              </div>
              {run && run.status !== "done" && <Progress value={run.progress} className="mt-2 h-1.5" />}
            </li>
          );
        })}
      </ul>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && pickFor.current) void resume(pickFor.current, file);
        }}
      />
    </div>
  );
}
