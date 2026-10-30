"use client";

import { AlertCircle, CheckCircle2, FileUp, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChannelPicker } from "@/components/common/channel-picker";
import { TagInput } from "@/components/common/tag-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { Channel, CreativeCategory, CreativeStatus, MediaType, VersionType } from "@/generated/prisma/enums";
import { CATEGORY_LABELS, CATEGORY_ORDER, STATUS_LABELS, VERSION_TYPE_LABELS } from "@/lib/constants";
import { resolveAssociations, type Association, type FileSuggestion } from "@/lib/files/matching";
import { ACCEPT_ATTRIBUTE } from "@/lib/files/types";
import { formatBytes } from "@/lib/format";
import { cancelUpload, isAbort, UploadError, uploadFile, type UploadSessionInfo } from "@/lib/upload/engine";
import { cn } from "@/lib/utils";
import { CreativeLookupDialog, type LookupCreative } from "./creative-lookup-dialog";
import { InterruptedUploads } from "./interrupted-uploads";

export type UploadContext = {
  applications: { id: string; name: string; brandColor: string }[];
  campaigns: { id: string; name: string; applicationId: string }[];
  tagSuggestions: string[];
  maxFileSizeBytes: number;
  initialApplicationId: string;
  initialCampaignId: string;
};

type PlanEntry = {
  clientId: string;
  name: string;
  error: string | null;
  displayName: string;
  matchKey: string;
  extension: string;
  isPreviewName: boolean;
  versionType: VersionType;
  mediaType: MediaType;
  mimeType: string;
  defaultCategory: CreativeCategory;
  suggestion: FileSuggestion | null;
};

type ItemState = "staged" | "queued" | "uploading" | "finalizing" | "done" | "error" | "cancelled";

type Item = {
  clientId: string;
  file: File;
  plan: PlanEntry | null;
  versionType: VersionType;
  versionTouched: boolean;
  association: Association | null;
  associationTouched: boolean;
  creativeName: string;
  nameTouched: boolean;
  category: CreativeCategory | null;
  label: string;
  extraCandidates: LookupCreative[];
  state: ItemState;
  uploaded: number;
  speed: number;
  error: string | null;
  retryable: boolean;
  session?: UploadSessionInfo;
  creativeId?: string;
};

const FILE_CONCURRENCY = 3;
let counter = 0;
const newClientId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}`;

function encodeAssociation(a: Association | null) {
  if (!a) return "";
  if (a.kind === "new") return "new";
  if (a.kind === "withFile") return `with:${a.clientId}`;
  return `existing:${a.creativeId}`;
}

export function UploadWorkspace({
  applications,
  campaigns,
  tagSuggestions,
  maxFileSizeBytes,
  initialApplicationId,
  initialCampaignId,
  disabled,
}: UploadContext & { disabled?: boolean }) {
  const [applicationId, setApplicationId] = useState(initialApplicationId);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [tags, setTags] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [planning, setPlanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lookupFor, setLookupFor] = useState<string | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const active = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((clientId: string, update: Partial<Item> | ((item: Item) => Partial<Item>)) => {
    setItems((list) =>
      list.map((it) => (it.clientId === clientId ? { ...it, ...(typeof update === "function" ? update(it) : update) } : it)),
    );
  }, []);

  const staged = items.filter((i) => i.state === "staged");
  const isUploading = items.some((i) => ["queued", "uploading", "finalizing"].includes(i.state));
  const appCampaigns = campaigns.filter((c) => c.applicationId === applicationId);

  // ── Planning: validate + suggest associations whenever the staged set changes ──
  const planKey = useMemo(
    () =>
      JSON.stringify({
        applicationId,
        files: staged.map((i) => [i.clientId, i.file.name, i.file.size, i.versionTouched ? i.versionType : null]),
      }),
    [applicationId, staged],
  );

  useEffect(() => {
    const current = itemsRef.current.filter((i) => i.state === "staged");
    if (!applicationId || current.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setPlanning(true);
      try {
        const res = await fetch("/api/uploads/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            applicationId,
            files: current.map((i) => ({
              clientId: i.clientId,
              name: i.file.name,
              size: i.file.size,
              ...(i.versionTouched ? { versionType: i.versionType } : {}),
            })),
          }),
        });
        const data = (await res.json()) as { files?: PlanEntry[]; error?: string };
        if (!res.ok || !data.files) throw new Error(data.error ?? "Could not analyse the files.");
        const byId = new Map(data.files.map((p) => [p.clientId, p]));
        setItems((list) =>
          list.map((it) => {
            const plan = byId.get(it.clientId);
            if (!plan || it.state !== "staged") return it;
            return {
              ...it,
              plan,
              versionType: it.versionTouched ? it.versionType : plan.versionType,
              association: it.associationTouched ? it.association : (plan.suggestion?.association ?? null),
              creativeName: it.nameTouched ? it.creativeName : plan.displayName,
              category: it.category ?? plan.defaultCategory,
            };
          }),
        );
      } catch (err) {
        if (!isAbort(err) && !(err instanceof DOMException)) toast.error(err instanceof Error ? err.message : "Could not analyse the files.");
      } finally {
        if (!ctrl.signal.aborted) setPlanning(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [planKey, applicationId]);

  // Warn before leaving while uploads are running.
  useEffect(() => {
    if (!isUploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isUploading]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.size >= 0);
    if (!list.length) return;
    const existing = new Set(itemsRef.current.filter((i) => i.state === "staged").map((i) => `${i.file.name}:${i.file.size}:${i.file.lastModified}`));
    const fresh = list.filter((f) => !existing.has(`${f.name}:${f.size}:${f.lastModified}`));
    if (fresh.length < list.length) toast.info(`${list.length - fresh.length} duplicate file(s) skipped.`);
    setItems((prev) => [
      // Clear finished rows from a previous batch.
      ...prev.filter((i) => !["done", "cancelled"].includes(i.state)),
      ...fresh.map<Item>((file) => ({
        clientId: newClientId(),
        file,
        plan: null,
        versionType: "FULL",
        versionTouched: false,
        association: null,
        associationTouched: false,
        creativeName: "",
        nameTouched: false,
        category: null,
        label: "",
        extraCandidates: [],
        state: "staged",
        uploaded: 0,
        speed: 0,
        error: null,
        retryable: true,
      })),
    ]);
  };

  const changeApplication = (id: string) => {
    setApplicationId(id);
    setCampaignId("");
    // Existing-creative choices belong to the previous application.
    setItems((list) =>
      list.map((it) => (it.state === "staged" ? { ...it, association: null, associationTouched: false, extraCandidates: [] } : it)),
    );
  };

  // ── Validation ──
  const resolved = useMemo(() => resolveAssociations(new Map(staged.map((i) => [i.clientId, i.association]))), [staged]);
  const problems = staged.filter((i) => !i.plan || i.plan.error || !resolved.get(i.clientId));
  const canStart = !disabled && !planning && staged.length > 0 && problems.length === 0 && !!applicationId && !starting;

  // ── Upload runner ──
  const pump = useCallback(() => {
    while (active.current < FILE_CONCURRENCY) {
      const next = itemsRef.current.find((i) => i.state === "queued" && i.session && !controllers.current.has(i.clientId));
      if (!next) return;
      active.current++;
      const ctrl = new AbortController();
      controllers.current.set(next.clientId, ctrl);
      // Mark synchronously so the loop does not pick it twice.
      itemsRef.current = itemsRef.current.map((i) => (i.clientId === next.clientId ? { ...i, state: "uploading" } : i));
      patch(next.clientId, { state: "uploading", error: null });
      void runOne(next, ctrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patch]);

  const runOne = async (item: Item, ctrl: AbortController) => {
    let lastEmit = 0;
    let lastBytes = 0;
    let lastTime = performance.now();
    let speed = 0;
    try {
      const result = await uploadFile(item.file, item.session!, {
        signal: ctrl.signal,
        onProgress: (p) => {
          const now = performance.now();
          if (now - lastTime > 500) {
            const instant = ((p.uploadedBytes - lastBytes) / (now - lastTime)) * 1000;
            speed = speed ? speed * 0.7 + instant * 0.3 : instant;
            lastBytes = p.uploadedBytes;
            lastTime = now;
          }
          if (now - lastEmit > 200 || p.phase === "finalizing") {
            lastEmit = now;
            patch(item.clientId, { uploaded: p.uploadedBytes, speed, state: p.phase === "finalizing" ? "finalizing" : "uploading" });
          }
        },
      });
      patch(item.clientId, { state: "done", uploaded: item.file.size, creativeId: result.kind === "file" ? result.creativeId : undefined });
    } catch (err) {
      if (isAbort(err)) {
        patch(item.clientId, { state: "cancelled" });
      } else {
        patch(item.clientId, {
          state: "error",
          error: err instanceof Error ? err.message : "Upload failed.",
          retryable: !(err instanceof UploadError) || err.retryable,
        });
      }
    } finally {
      controllers.current.delete(item.clientId);
      active.current--;
      pump();
    }
  };

  useEffect(() => {
    pump();
  }, [items, pump]);

  const start = async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          campaignId: campaignId || null,
          description: description.trim() || null,
          tags,
          channels,
          files: staged.map((i) => ({
            clientId: i.clientId,
            name: i.file.name,
            size: i.file.size,
            lastModified: i.file.lastModified,
            versionType: i.versionType,
            label: i.versionType === "VARIANT" ? i.label.trim() || null : null,
            creativeName: i.creativeName.trim() || null,
            category: i.category,
            association: i.association,
          })),
        }),
      });
      const data = (await res.json()) as { sessions?: (UploadSessionInfo & { clientId: string; creativeId: string })[]; error?: string };
      if (!res.ok || !data.sessions) throw new Error(data.error ?? "Could not start the upload.");
      const byId = new Map(data.sessions.map((s) => [s.clientId, s]));
      setItems((list) =>
        list.map((it) => {
          const s = byId.get(it.clientId);
          return s ? { ...it, session: s, creativeId: s.creativeId, state: "queued" } : it;
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the upload.");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async (item: Item) => {
    controllers.current.get(item.clientId)?.abort();
    if (item.session) await cancelUpload(item.session.sessionId);
    patch(item.clientId, { state: "cancelled" });
  };

  const cancelAll = async () => {
    await Promise.all(itemsRef.current.filter((i) => ["queued", "uploading", "error"].includes(i.state)).map(cancel));
  };

  const retry = (item: Item) => patch(item.clientId, { state: "queued", error: null });

  const remove = (clientId: string) => setItems((list) => list.filter((i) => i.clientId !== clientId));

  const finished = items.filter((i) => i.state === "done");
  const totalBytes = items.filter((i) => i.state !== "staged" && i.state !== "cancelled").reduce((s, i) => s + i.file.size, 0);
  const uploadedBytes = items.filter((i) => i.state !== "staged" && i.state !== "cancelled").reduce((s, i) => s + i.uploaded, 0);
  const createdCreatives = [...new Set(finished.map((i) => i.creativeId).filter(Boolean))] as string[];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <InterruptedUploads disabled={disabled} />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
            dragging ? "border-primary bg-accent/50" : "border-border",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UploadCloud className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">Drag and drop files here</p>
            <p className="text-sm text-muted-foreground">
              Videos, images, banners, PDFs and audio · up to {formatBytes(maxFileSizeBytes)} per file. Files ending in{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">_preview</code> are detected as preview versions.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
            data-testid="file-input"
          />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <FileUp /> Choose files
          </Button>
        </div>

        {items.length > 0 && (
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-3">
              <div>
                <CardTitle className="text-sm">
                  {staged.length > 0 ? `${staged.length} file${staged.length === 1 ? "" : "s"} ready` : "Uploads"}
                  {planning && <Spinner className="ml-2 inline size-3.5" />}
                </CardTitle>
                {totalBytes > 0 && (
                  <CardDescription className="tabular">
                    {formatBytes(uploadedBytes)} of {formatBytes(totalBytes)} uploaded
                  </CardDescription>
                )}
              </div>
              {isUploading && (
                <Button variant="ghost" size="sm" onClick={cancelAll}>
                  <X /> Cancel all
                </Button>
              )}
            </CardHeader>
            <CardContent className="divide-y p-0">
              {items.map((item) => (
                <FileRow
                  key={item.clientId}
                  item={item}
                  items={staged}
                  onPatch={(u) => patch(item.clientId, u)}
                  onRemove={() => remove(item.clientId)}
                  onCancel={() => cancel(item)}
                  onRetry={() => retry(item)}
                  onLookup={() => setLookupFor(item.clientId)}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {finished.length > 0 && !isUploading && staged.length === 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">
                  {finished.length} file{finished.length === 1 ? "" : "s"} uploaded to {createdCreatives.length} creative
                  {createdCreatives.length === 1 ? "" : "s"}
                </p>
                <p className="text-sm opacity-80">Thumbnails and metadata are being generated in the background. New creatives start as drafts.</p>
              </div>
            </div>
            <div className="flex gap-2">
              {createdCreatives.length === 1 ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/creatives/${createdCreatives[0]}`}>Open creative</Link>
                </Button>
              ) : null}
              <Button asChild size="sm">
                <Link href="/library?sort=newest">View in library</Link>
              </Button>
            </div>
          </div>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details for new creatives</CardTitle>
            <CardDescription>Applied to every creative created by this upload. You can edit each creative afterwards.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="upload-app">Application</FieldLabel>
                <Select value={applicationId} onValueChange={changeApplication} disabled={isUploading}>
                  <SelectTrigger id="upload-app" className="w-full">
                    <SelectValue placeholder="Choose application" />
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
              </Field>
              <Field>
                <FieldLabel htmlFor="upload-campaign">Campaign</FieldLabel>
                <Select value={campaignId || "none"} onValueChange={(v) => setCampaignId(v === "none" ? "" : v)} disabled={isUploading}>
                  <SelectTrigger id="upload-campaign" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {appCampaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="upload-tags">Tags</FieldLabel>
                <TagInput id="upload-tags" value={tags} onChange={setTags} suggestions={tagSuggestions} />
              </Field>
              <Field>
                <FieldLabel htmlFor="upload-channels">Platforms / channels</FieldLabel>
                <ChannelPicker id="upload-channels" value={channels} onChange={setChannels} />
              </Field>
              <Field>
                <FieldLabel htmlFor="upload-description">Description</FieldLabel>
                <Textarea
                  id="upload-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional context for reviewers and colleagues"
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="space-y-2">
          {problems.length > 0 && staged.length > 0 && !planning && (
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {problems.length} file{problems.length === 1 ? " needs" : "s need"} attention before uploading.
            </p>
          )}
          <Button className="w-full" size="lg" onClick={start} disabled={!canStart} data-testid="start-upload">
            {starting ? <Spinner /> : <UploadCloud />}
            {staged.length > 0 ? `Upload ${staged.length} file${staged.length === 1 ? "" : "s"}` : "Upload"}
          </Button>
        </div>
      </aside>

      <CreativeLookupDialog
        open={lookupFor !== null}
        onOpenChange={(v) => !v && setLookupFor(null)}
        applicationId={applicationId}
        onSelect={(creative) => {
          if (!lookupFor) return;
          patch(lookupFor, (it) => ({
            association: { kind: "existing", creativeId: creative.id },
            associationTouched: true,
            extraCandidates: it.extraCandidates.some((c) => c.id === creative.id) ? it.extraCandidates : [...it.extraCandidates, creative],
          }));
          setLookupFor(null);
        }}
      />
    </div>
  );
}

function FileRow({
  item,
  items,
  onPatch,
  onRemove,
  onCancel,
  onRetry,
  onLookup,
}: {
  item: Item;
  items: Item[];
  onPatch: (u: Partial<Item>) => void;
  onRemove: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onLookup: () => void;
}) {
  const { file, plan } = item;
  const pct = file.size ? Math.round((item.uploaded / file.size) * 100) : 0;
  const isStaged = item.state === "staged";
  const needsDecision = isStaged && plan && !plan.error && !item.association;
  const leadsNew = item.association?.kind === "new";
  const peers = new Set(plan?.suggestion?.peers ?? []);
  const others = items.filter((o) => o.clientId !== item.clientId && o.plan && !o.plan.error);
  const peerFiles = others.filter((o) => peers.has(o.clientId));
  const otherFiles = others.filter((o) => !peers.has(o.clientId) && o.versionType === "FULL").slice(0, 30);
  const candidates = [
    ...(plan?.suggestion?.candidates ?? []).map((c) => ({ id: c.creativeId, name: c.name, status: c.status, hasFull: c.hasFull })),
    ...item.extraCandidates.filter((e) => !(plan?.suggestion?.candidates ?? []).some((c) => c.creativeId === e.id)),
  ];

  const setAssociation = (value: string) => {
    if (value === "__lookup") return onLookup();
    let association: Association | null = null;
    if (value === "new") association = { kind: "new", groupKey: item.clientId };
    else if (value.startsWith("with:")) association = { kind: "withFile", clientId: value.slice(5) };
    else if (value.startsWith("existing:")) association = { kind: "existing", creativeId: value.slice(9) };
    onPatch({ association, associationTouched: true });
  };

  return (
    <div className={cn("space-y-3 px-4 py-3.5", needsDecision && "bg-amber-50/60 dark:bg-amber-500/5")} data-testid="upload-row">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
            {item.versionType === "PREVIEW" && (
              <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tracking-wider">
                PREVIEW
              </Badge>
            )}
            <span className="tabular text-xs text-muted-foreground">{formatBytes(file.size)}</span>
          </div>
          {plan?.error ? (
            <p className="mt-1 text-xs text-destructive">{plan.error}</p>
          ) : isStaged && plan?.suggestion && !item.associationTouched ? (
            <p className={cn("mt-1 text-xs", needsDecision ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
              {plan.suggestion.reason}
            </p>
          ) : null}
          {item.state === "error" && <p className="mt-1 text-xs text-destructive">{item.error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isStaged && (
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${file.name}`}>
              <Trash2 />
            </Button>
          )}
          {(item.state === "uploading" || item.state === "queued") && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X /> Cancel
            </Button>
          )}
          {item.state === "error" && (
            <>
              {item.retryable && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  <RotateCcw /> Retry
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={item.retryable ? onCancel : onRemove} aria-label="Discard">
                <X />
              </Button>
            </>
          )}
          {item.state === "done" && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/creatives/${item.creativeId}`}>
                <CheckCircle2 className="text-emerald-600" /> Open
              </Link>
            </Button>
          )}
          {item.state === "cancelled" && <span className="text-xs text-muted-foreground">Cancelled</span>}
        </div>
      </div>

      {isStaged && plan && !plan.error && (
        <div className="grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)] lg:grid-cols-[130px_minmax(0,1.2fr)_minmax(0,1fr)_170px]">
          <Select
            value={item.versionType}
            onValueChange={(v) => onPatch({ versionType: v as VersionType, versionTouched: true })}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Version type">
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
          <Select value={encodeAssociation(item.association)} onValueChange={setAssociation}>
            <SelectTrigger size="sm" className={cn("w-full", needsDecision && "border-amber-400")} aria-label="Creative">
              <SelectValue placeholder="Choose creative…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New creative</SelectItem>
              {(peerFiles.length > 0 || otherFiles.length > 0) && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Same creative as a file in this upload</SelectLabel>
                    {[...peerFiles, ...otherFiles].map((o) => (
                      <SelectItem key={o.clientId} value={`with:${o.clientId}`}>
                        {o.file.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              {candidates.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Existing creative</SelectLabel>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={`existing:${c.id}`}>
                        {c.name} · {STATUS_LABELS[c.status as CreativeStatus]}
                        {!c.hasFull ? " · preview only" : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
              <SelectSeparator />
              <SelectItem value="__lookup">Find another creative…</SelectItem>
            </SelectContent>
          </Select>
          {leadsNew ? (
            <>
              <Input
                value={item.creativeName}
                onChange={(e) => onPatch({ creativeName: e.target.value, nameTouched: true })}
                placeholder="Creative name"
                className="h-7 text-sm"
                aria-label="Creative name"
                maxLength={200}
              />
              <Select value={item.category ?? undefined} onValueChange={(v) => onPatch({ category: v as CreativeCategory })}>
                <SelectTrigger size="sm" className="w-full" aria-label="Category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ORDER.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <p className="flex items-center text-xs text-muted-foreground lg:col-span-2">
              {item.association?.kind === "withFile"
                ? `Will be stored with ${items.find((o) => o.clientId === (item.association as { clientId: string }).clientId)?.file.name ?? "the linked file"}.`
                : item.association?.kind === "existing"
                  ? `Added as a new ${VERSION_TYPE_LABELS[item.versionType].toLowerCase()} version of “${candidates.find((c) => c.id === (item.association as { creativeId: string }).creativeId)?.name ?? "the selected creative"}”.`
                  : null}
            </p>
          )}
          {item.versionType === "VARIANT" && (
            <Field className="sm:col-span-2 lg:col-span-4">
              <Input
                value={item.label}
                onChange={(e) => onPatch({ label: e.target.value })}
                placeholder="Variant label, e.g. 9:16 Story, Arabic subtitles"
                className="h-7 text-sm"
                maxLength={80}
              />
              <FieldDescription className="sr-only">Variant label</FieldDescription>
            </Field>
          )}
        </div>
      )}

      {!isStaged && item.state !== "cancelled" && (
        <div className="space-y-1">
          <Progress value={item.state === "done" ? 100 : pct} className="h-1.5" />
          <div className="tabular flex justify-between text-[11px] text-muted-foreground">
            <span>
              {item.state === "queued" && "Waiting…"}
              {item.state === "uploading" && `${pct}% · ${formatBytes(item.uploaded)} of ${formatBytes(file.size)}`}
              {item.state === "finalizing" && "Verifying and registering…"}
              {item.state === "done" && "Uploaded"}
              {item.state === "error" && (item.retryable ? "Failed — you can retry; completed parts are kept." : "Rejected")}
            </span>
            {item.state === "uploading" && item.speed > 0 && <span>{formatBytes(item.speed)}/s</span>}
          </div>
        </div>
      )}
    </div>
  );
}
