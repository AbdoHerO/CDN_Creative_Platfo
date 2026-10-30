"use client";

import { AlertTriangle, ArrowRight, Replace, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { MediaType, VersionType } from "@/generated/prisma/enums";
import { MEDIA_TYPE_LABELS, VERSION_TYPE_LABELS } from "@/lib/constants";
import { FILE_TYPES, fileTypeForName } from "@/lib/files/types";
import { formatBytes } from "@/lib/format";
import { isAbort, uploadFile, type UploadSessionInfo } from "@/lib/upload/engine";

export type ReplaceTarget = {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  versionType: VersionType;
  versionNumber: number;
  mediaType: MediaType;
};

/**
 * Replace a file with another one of the same kind (a video with a video…).
 * The old file is permanently deleted from storage once the new one is
 * uploaded and verified, so its space is freed; the version number is kept.
 */
export function ReplaceFileDialog({
  creativeId,
  applicationId,
  file,
  resetsApproval,
  open: controlledOpen,
  onOpenChange,
  trigger,
}: {
  creativeId: string;
  applicationId: string;
  file: ReplaceTarget;
  resetsApproval: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const router = useRouter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [next, setNext] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = progress !== null;
  const kind = MEDIA_TYPE_LABELS[file.mediaType].toLowerCase();
  const accept = FILE_TYPES.filter((t) => t.mediaType === file.mediaType)
    .flatMap((t) => t.extensions)
    .map((e) => `.${e}`)
    .join(",");

  const change = (v: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(v);
    onOpenChange?.(v);
    if (!v) {
      setNext(null);
      setError(null);
    }
  };
  const setOpen = (v: boolean) => {
    if (!busy) change(v);
  };

  const pick = (f: File | null) => {
    setNext(f);
    setError(f && fileTypeForName(f.name)?.mediaType !== file.mediaType ? `Choose a ${kind} file to replace this ${kind}.` : null);
  };

  const start = async () => {
    if (!next || error) return;
    ctrl.current = new AbortController();
    setProgress(0);
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          files: [
            {
              clientId: "replace",
              name: next.name,
              size: next.size,
              lastModified: next.lastModified,
              versionType: file.versionType,
              association: { kind: "existing", creativeId },
              replaceFileId: file.id,
            },
          ],
        }),
      });
      const data = (await res.json()) as { sessions?: UploadSessionInfo[]; error?: string };
      if (!res.ok || !data.sessions?.[0]) throw new Error(data.error ?? "Could not start the upload.");
      await uploadFile(next, data.sessions[0], {
        signal: ctrl.current.signal,
        onProgress: (p) => setProgress(Math.round((p.uploadedBytes / p.totalBytes) * 100)),
      });
      toast.success(`${file.originalFilename} was replaced by ${next.name}. ${formatBytes(file.sizeBytes)} freed.`);
      setProgress(null);
      change(false);
      router.refresh();
    } catch (err) {
      setProgress(null);
      if (!isAbort(err)) toast.error(err instanceof Error ? err.message : "Replacement failed.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" data-testid="replace-file">
            <Replace /> Replace file
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace this {kind}</DialogTitle>
          <DialogDescription>
            {VERSION_TYPE_LABELS[file.versionType]} v{file.versionNumber} · {file.originalFilename} · {formatBytes(file.sizeBytes)}
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors hover:bg-muted/40"
        >
          <Upload className="size-5 text-muted-foreground" />
          {next ? (
            <span className="font-medium">
              {next.name} · {formatBytes(next.size)}
            </span>
          ) : (
            <span className="text-muted-foreground">Choose the new {kind}</span>
          )}
        </button>
        <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="replace-input" />

        {error && <p className="text-sm text-destructive">{error}</p>}

        {next && !error && (
          <Alert variant="destructive" data-testid="replace-warning">
            <AlertTriangle />
            <AlertTitle>The current file will be deleted permanently</AlertTitle>
            <AlertDescription>
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="line-through">{file.originalFilename}</span>
                <ArrowRight className="size-3.5" />
                <span className="font-medium text-foreground">{next.name}</span>
              </p>
              <p>
                {formatBytes(file.sizeBytes)} is freed from storage and the new file becomes {VERSION_TYPE_LABELS[file.versionType].toLowerCase()} v
                {file.versionNumber}. This cannot be undone.
              </p>
              {resetsApproval && <p>This creative is approved: replacing its full version returns it to draft for a new validation.</p>}
            </AlertDescription>
          </Alert>
        )}

        {busy && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <p className="text-xs text-muted-foreground">Uploading… {progress}%</p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (busy) ctrl.current?.abort();
              else setOpen(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={start} disabled={!next || !!error || busy} data-testid="confirm-replace">
            {busy ? <Spinner /> : <Replace />}
            Replace and delete old file
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
