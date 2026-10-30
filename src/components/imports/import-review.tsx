"use client";

import { AlertTriangle, Ban, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { CreativeCategory, CreativeStatus, MediaType, VersionType } from "@/generated/prisma/enums";
import { CATEGORY_LABELS, CATEGORY_ORDER, STATUS_LABELS, VERSION_TYPE_LABELS } from "@/lib/constants";
import { resolveAssociations, type Association } from "@/lib/files/matching";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cancelImportAction, confirmImportAction } from "@/server/actions/imports";

type ReviewItem = {
  id: string;
  entryPath: string;
  filename: string;
  sizeBytes: number;
  mediaType: MediaType;
  extension: string;
  versionType: VersionType;
  matchKey: string;
  groupKey: string;
  targetCreativeId: string | null;
  creativeName: string;
  category: CreativeCategory;
  applicationId: string;
  campaignId: string | null;
  suggestedApplicationId: string | null;
  suggestedCampaignId: string | null;
  needsReview: boolean;
  note: string | null;
};

type State = ReviewItem & { include: boolean; association: Association | null };

function initialAssociation(i: ReviewItem): Association | null {
  if (i.needsReview) return null; // the user must decide
  if (i.targetCreativeId) return { kind: "existing", creativeId: i.targetCreativeId };
  if (i.groupKey === i.id) return { kind: "new", groupKey: i.id };
  return { kind: "withFile", clientId: i.groupKey };
}

const encode = (a: Association | null) => (!a ? "" : a.kind === "new" ? "new" : a.kind === "withFile" ? `with:${a.clientId}` : `existing:${a.creativeId}`);

export function ImportReview({
  batchId,
  items,
  rejected,
  applications,
  campaigns,
  candidates,
}: {
  batchId: string;
  items: ReviewItem[];
  rejected: { id: string; entryPath: string; reason: string; sizeBytes: number }[];
  applications: { id: string; name: string; brandColor: string }[];
  campaigns: { id: string; name: string; applicationId: string }[];
  candidates: { id: string; name: string; status: CreativeStatus; matchKey: string; applicationId: string; hasFull: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<State[]>(() => items.map((i) => ({ ...i, include: true, association: initialAssociation(i) })));

  const patch = (id: string, update: Partial<State>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...update } : r)));
  const included = rows.filter((r) => r.include);
  const resolved = useMemo(() => resolveAssociations(new Map(included.map((r) => [r.id, r.association]))), [included]);
  const undecided = included.filter((r) => !resolved.get(r.id));
  const newCreatives = new Set([...resolved.values()].flatMap((r) => (r?.kind === "new" ? [r.groupKey] : []))).size;
  const totalBytes = included.reduce((s, r) => s + r.sizeBytes, 0);

  const confirm = () =>
    startTransition(async () => {
      const res = await confirmImportAction(batchId, {
        items: rows.map((r) => ({
          id: r.id,
          include: r.include,
          versionType: r.versionType,
          creativeName: r.creativeName.trim() || r.filename,
          category: r.category,
          applicationId: r.applicationId,
          campaignId: r.campaignId,
          association: r.include ? r.association : null,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-medium">Review before importing</p>
          <p className="text-muted-foreground">
            {included.length} of {rows.length} file(s) selected · {formatBytes(totalBytes)} · {newCreatives} new creative(s)
            {rejected.length > 0 && ` · ${rejected.length} rejected`}
          </p>
        </div>
        <div className="flex gap-2">
          <ConfirmDialog
            trigger={
              <Button variant="outline" disabled={pending}>
                <Ban /> Cancel import
              </Button>
            }
            title="Cancel this import?"
            description="The uploaded archive is deleted and nothing is added to the library."
            confirmLabel="Cancel import"
            destructive
            onConfirm={async () => {
              const res = await cancelImportAction(batchId);
              if (!res.ok) {
                toast.error(res.error);
                return false;
              }
              router.refresh();
            }}
          />
          <Button onClick={confirm} disabled={pending || included.length === 0 || undecided.length > 0} data-testid="confirm-import">
            {pending ? <Spinner /> : <CheckCircle2 />}
            Import {included.length} file{included.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
      {undecided.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
          <AlertTriangle className="size-4" /> {undecided.length} file(s) need a decision about which creative they belong to.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={included.length === rows.length ? true : included.length === 0 ? false : "indeterminate"}
                    onCheckedChange={(v) => setRows((list) => list.map((r) => ({ ...r, include: v === true })))}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Creative</th>
                <th className="px-3 py-2 font-medium">Application</th>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const peers = rows.filter((o) => o.id !== r.id && o.include && o.applicationId === r.applicationId && o.matchKey === r.matchKey);
                const cands = candidates.filter((c) => c.applicationId === r.applicationId && c.matchKey === r.matchKey);
                const leads = r.association?.kind === "new";
                const needsDecision = r.include && !resolved.get(r.id);
                return (
                  <tr key={r.id} className={cn(!r.include && "opacity-50", needsDecision && "bg-amber-50/60 dark:bg-amber-500/5")}>
                    <td className="px-3 py-2 align-top">
                      <Checkbox checked={r.include} onCheckedChange={(v) => patch(r.id, { include: v === true })} aria-label={`Include ${r.filename}`} />
                    </td>
                    <td className="max-w-[280px] px-3 py-2 align-top">
                      <p className="truncate font-medium" title={r.entryPath}>
                        {r.filename}
                      </p>
                      <p className="truncate text-xs text-muted-foreground" title={r.entryPath}>
                        {r.entryPath} · {formatBytes(r.sizeBytes)}
                      </p>
                      {r.note && <p className={cn("mt-1 text-xs", r.needsReview ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{r.note}</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select value={r.versionType} onValueChange={(v) => patch(r.id, { versionType: v as VersionType })}>
                        <SelectTrigger size="sm" className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["FULL", "PREVIEW", "VARIANT"] as VersionType[]).map((v) => (
                            <SelectItem key={v} value={v}>
                              {VERSION_TYPE_LABELS[v]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {r.versionType === "PREVIEW" && (
                        <Badge variant="secondary" className="mt-1 h-4 px-1.5 text-[10px] tracking-wider">
                          PREVIEW
                        </Badge>
                      )}
                    </td>
                    <td className="space-y-1.5 px-3 py-2 align-top">
                      <Select
                        value={encode(r.association)}
                        onValueChange={(v) =>
                          patch(r.id, {
                            association:
                              v === "new"
                                ? { kind: "new", groupKey: r.id }
                                : v.startsWith("with:")
                                  ? { kind: "withFile", clientId: v.slice(5) }
                                  : { kind: "existing", creativeId: v.slice(9) },
                          })
                        }
                      >
                        <SelectTrigger size="sm" className={cn("w-[230px]", needsDecision && "border-amber-400")}>
                          <SelectValue placeholder="Decision needed…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New creative</SelectItem>
                          {peers.length > 0 && (
                            <>
                              <SelectSeparator />
                              <SelectGroup>
                                <SelectLabel>Same creative as</SelectLabel>
                                {peers.map((p) => (
                                  <SelectItem key={p.id} value={`with:${p.id}`}>
                                    {p.filename}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </>
                          )}
                          {cands.length > 0 && (
                            <>
                              <SelectSeparator />
                              <SelectGroup>
                                <SelectLabel>Existing creative</SelectLabel>
                                {cands.map((c) => (
                                  <SelectItem key={c.id} value={`existing:${c.id}`}>
                                    {c.name} · {STATUS_LABELS[c.status]}
                                    {!c.hasFull ? " · preview only" : ""}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {leads && (
                        <Input
                          value={r.creativeName}
                          onChange={(e) => patch(r.id, { creativeName: e.target.value })}
                          className="h-7 w-[230px] text-sm"
                          aria-label="Creative name"
                          maxLength={200}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select value={r.applicationId} onValueChange={(v) => patch(r.id, { applicationId: v, campaignId: null, association: r.association?.kind === "existing" ? null : r.association })}>
                        <SelectTrigger size="sm" className="w-[150px]">
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
                      {r.suggestedApplicationId === r.applicationId && <p className="mt-1 text-[11px] text-muted-foreground">From folder name</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select value={r.campaignId ?? "none"} onValueChange={(v) => patch(r.id, { campaignId: v === "none" ? null : v })}>
                        <SelectTrigger size="sm" className="w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No campaign</SelectItem>
                          {campaigns
                            .filter((c) => c.applicationId === r.applicationId)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {r.suggestedCampaignId && r.suggestedCampaignId === r.campaignId && <p className="mt-1 text-[11px] text-muted-foreground">From folder name</p>}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select value={r.category} onValueChange={(v) => patch(r.id, { category: v as CreativeCategory })}>
                        <SelectTrigger size="sm" className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_ORDER.map((c) => (
                            <SelectItem key={c} value={c}>
                              {CATEGORY_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {rejected.length > 0 && (
        <div className="rounded-xl border bg-card">
          <p className="border-b px-4 py-2.5 text-sm font-medium">Rejected entries ({rejected.length})</p>
          <ul className="divide-y text-sm">
            {rejected.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-2">
                <span className="min-w-0 truncate" title={r.entryPath}>
                  {r.entryPath}
                </span>
                <span className="shrink-0 text-xs text-destructive">{r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
