"use client";

import { FilePlus2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { VersionType } from "@/generated/prisma/enums";
import { VERSION_TYPE_LABELS } from "@/lib/constants";
import { parseFilename } from "@/lib/files/naming";
import { ACCEPT_ATTRIBUTE } from "@/lib/files/types";
import { formatBytes } from "@/lib/format";
import { isAbort, uploadFile, type UploadSessionInfo } from "@/lib/upload/engine";

/** Upload a new full / preview / variant version of an existing creative. */
export function UploadVersionDialog({
  creativeId,
  applicationId,
  resetsApproval,
}: {
  creativeId: string;
  applicationId: string;
  resetsApproval: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [versionType, setVersionType] = useState<VersionType>("FULL");
  const [label, setLabel] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | null) => {
    setFile(f);
    if (f) setVersionType(parseFilename(f.name).detectedVersionType);
  };

  const start = async () => {
    if (!file) return;
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
              clientId: "v",
              name: file.name,
              size: file.size,
              lastModified: file.lastModified,
              versionType,
              label: versionType === "VARIANT" ? label.trim() || null : null,
              association: { kind: "existing", creativeId },
            },
          ],
        }),
      });
      const data = (await res.json()) as { sessions?: UploadSessionInfo[]; error?: string };
      if (!res.ok || !data.sessions?.[0]) throw new Error(data.error ?? "Could not start the upload.");
      await uploadFile(file, data.sessions[0], {
        signal: ctrl.current.signal,
        onProgress: (p) => setProgress(Math.round((p.uploadedBytes / p.totalBytes) * 100)),
      });
      toast.success(`${VERSION_TYPE_LABELS[versionType]} version uploaded.`);
      setOpen(false);
      setFile(null);
      setProgress(null);
      router.refresh();
    } catch (err) {
      setProgress(null);
      if (!isAbort(err)) toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const busy = progress !== null;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FilePlus2 /> Upload version
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a new version</DialogTitle>
          <DialogDescription>
            The new file becomes the current version of its type; earlier versions remain available in the history.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-sm transition-colors hover:bg-muted/40"
          >
            <Upload className="size-5 text-muted-foreground" />
            {file ? (
              <span className="font-medium">
                {file.name} · {formatBytes(file.size)}
              </span>
            ) : (
              <span className="text-muted-foreground">Choose a file</span>
            )}
          </button>
          <input ref={inputRef} type="file" accept={ACCEPT_ATTRIBUTE} className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <Field>
            <FieldLabel>Version type</FieldLabel>
            <Select value={versionType} onValueChange={(v) => setVersionType(v as VersionType)} disabled={busy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["FULL", "PREVIEW", "VARIANT"] as VersionType[]).map((v) => (
                  <SelectItem key={v} value={v}>
                    {VERSION_TYPE_LABELS[v]} version
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {versionType === "FULL" && resetsApproval && (
              <FieldDescription className="text-amber-700 dark:text-amber-300">
                This creative is approved. A new full version returns it to draft so it can be validated again.
              </FieldDescription>
            )}
          </Field>
          {versionType === "VARIANT" && (
            <Field>
              <FieldLabel htmlFor="variant-label">Variant label</FieldLabel>
              <Input id="variant-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. 9:16 Story" maxLength={80} />
            </Field>
          )}
          {busy && <Progress value={progress} className="h-1.5" />}
        </FieldGroup>
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
          <Button onClick={start} disabled={!file || busy}>
            {busy && <Spinner />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
