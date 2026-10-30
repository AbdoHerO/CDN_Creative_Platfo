"use client";

import { Download, FileArchive, FolderTree, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatBytes } from "@/lib/format";
import { isAbort, uploadFile, type UploadSessionInfo } from "@/lib/upload/engine";
import type { UploadContext } from "./upload-workspace";

/**
 * ZIP import: the archive is uploaded to storage as-is, then the worker inspects it
 * safely (path traversal, zip bombs, unsupported types) and prepares a review.
 * Nothing is registered until the user confirms the review.
 */
export function ZipImportForm({ applications, campaigns, initialApplicationId, initialCampaignId, disabled }: UploadContext & { disabled?: boolean }) {
  const router = useRouter();
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [keepArchive, setKeepArchive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = async () => {
    if (!file) return;
    ctrl.current = new AbortController();
    setProgress(0);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          campaignId: campaignId || null,
          keepArchive,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        }),
      });
      const data = (await res.json()) as { batchId?: string; session?: UploadSessionInfo; error?: string };
      if (!res.ok || !data.session || !data.batchId) throw new Error(data.error ?? "Could not start the import.");
      await uploadFile(file, data.session, {
        signal: ctrl.current.signal,
        onProgress: (p) => setProgress(Math.round((p.uploadedBytes / p.totalBytes) * 100)),
      });
      toast.success("Archive uploaded. Analysing contents…");
      router.push(`/imports/${data.batchId}`);
    } catch (err) {
      setProgress(null);
      if (!isAbort(err)) toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  };

  const busy = progress !== null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import a ZIP archive</CardTitle>
          <CardDescription>
            Zip your <code className="text-xs">data_creatives</code> folder (one folder per platform) and upload it. You review every file before
            anything is added; each import adds new creatives and never replaces existing ones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:bg-muted/40 disabled:opacity-60"
          >
            <FileArchive className="size-7 text-muted-foreground" />
            {file ? (
              <span className="text-sm font-medium">
                {file.name} · {formatBytes(file.size)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Choose a .zip archive</span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="zip-input"
          />
          {busy && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading archive… {progress}%</span>
                <button type="button" className="hover:text-foreground" onClick={() => ctrl.current?.abort()}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            Archives are extracted on the server with strict limits: unsafe paths, symbolic links, encrypted entries, oversized or
            suspiciously compressed files and unsupported formats are rejected. Extracted files are stored byte-for-byte.
          </div>
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FolderTree className="size-4" /> Folder structure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-relaxed">{`data_creatives/
  <platform>/
    banners/   banner.jpg
    videos/    spot.mp4
               spot_preview.mp4
    pdf/       guide.pdf`}</pre>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">_preview</span> or <span className="font-medium text-foreground">-preview</span>{" "}
                in a name marks the lite version of a video.
              </li>
              <li>A folder for a platform that does not exist yet creates it (administrators).</li>
              <li>Names already in the library get (2), (3)…</li>
            </ul>
            <Button asChild variant="outline" className="w-full" data-testid="download-template">
              <a href="/api/imports/template" download>
                <Download /> Download import template
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Fallback application</FieldLabel>
                <Select
                  value={applicationId}
                  onValueChange={(v) => {
                    setApplicationId(v);
                    setCampaignId("");
                  }}
                  disabled={busy}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {applications.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="size-2 rounded-full" style={{ backgroundColor: a.brandColor }} />
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Used only for files that are not inside a platform folder.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Default campaign</FieldLabel>
                <Select value={campaignId || "none"} onValueChange={(v) => setCampaignId(v === "none" ? "" : v)} disabled={busy}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaigns
                      .filter((c) => c.applicationId === applicationId)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="keep-archive" checked={keepArchive} onCheckedChange={(v) => setKeepArchive(v === true)} disabled={busy} />
                <FieldLabel htmlFor="keep-archive" className="font-normal">
                  Keep the original archive as an import record
                </FieldLabel>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Button className="w-full" size="lg" onClick={start} disabled={!file || busy || disabled || !applicationId}>
          {busy ? <Spinner /> : <FileArchive />}
          Upload and analyse
        </Button>
      </aside>
    </div>
  );
}
