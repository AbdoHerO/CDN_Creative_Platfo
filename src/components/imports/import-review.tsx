"use client";

import { AlertTriangle, Ban, Check, CheckCircle2, Minus, Sparkles, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BadgeSelect } from "@/components/badges/badge-select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { CreativeCategory, MediaType, VersionType } from "@/generated/prisma/enums";
import { CATEGORY_LABELS, CATEGORY_ORDER, VERSION_TYPE_LABELS } from "@/lib/constants";
import { resolveAssociations, type Association } from "@/lib/files/matching";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cancelImportAction, confirmImportAction } from "@/server/actions/imports";
import type { BadgeView } from "@/server/services/badges";

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
  applicationId: string | null;
  /** Platform folder with no application yet (created on confirmation). */
  newApplicationName: string | null;
  campaignId: string | null;
  badgeIds: string[];
  suggestedApplicationId: string | null;
  suggestedCampaignId: string | null;
  needsReview: boolean;
  note: string | null;
};

/** `platform` is an application id, or `new:<name>` for a platform created on confirmation. */
type State = ReviewItem & { include: boolean; association: Association | null; platform: string };

const NEW = "new:";

function initialAssociation(i: ReviewItem): Association | null {
  if (i.needsReview) return null; // the user must decide
  if (i.targetCreativeId) return { kind: "existing", creativeId: i.targetCreativeId };
  if (i.groupKey === i.id) return { kind: "new", groupKey: i.id };
  return { kind: "withFile", clientId: i.groupKey };
}

const encode = (a: Association | null) => (!a ? "" : a.kind === "new" ? "new" : a.kind === "withFile" ? `with:${a.clientId}` : "");

export function ImportReview({
  batchId,
  items,
  rejected,
  applications,
  campaigns,
  canCreatePlatforms,
  badges,
  canCreateBadges,
}: {
  batchId: string;
  items: ReviewItem[];
  rejected: { id: string; entryPath: string; reason: string; sizeBytes: number }[];
  applications: { id: string; name: string; brandColor: string }[];
  campaigns: { id: string; name: string; applicationId: string }[];
  canCreatePlatforms: boolean;
  badges: BadgeView[];
  canCreateBadges: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<State[]>(() =>
    items.map((i) => ({
      ...i,
      include: true,
      association: initialAssociation(i),
      platform: i.applicationId ?? `${NEW}${i.newApplicationName ?? ""}`,
    })),
  );
  const [catalog, setCatalog] = useState(badges);
  const addToCatalog = (b: BadgeView) => setCatalog((list) => (list.some((x) => x.id === b.id) ? list : [...list, b]));
  const newPlatformNames = [...new Set(items.flatMap((i) => (i.newApplicationName ? [i.newApplicationName] : [])))];

  const patch = (id: string, update: Partial<State>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...update } : r)));
  const included = rows.filter((r) => r.include);
  const resolved = useMemo(() => resolveAssociations(new Map(included.map((r) => [r.id, r.association]))), [included]);
  const undecided = included.filter((r) => !resolved.get(r.id));
  const newCreatives = new Set([...resolved.values()].flatMap((r) => (r?.kind === "new" ? [r.groupKey] : []))).size;
  const totalBytes = included.reduce((s, r) => s + r.sizeBytes, 0);
  const creatingPlatforms = [...new Set(included.flatMap((r) => (r.platform.startsWith(NEW) ? [r.platform.slice(NEW.length)] : [])))];
  const blockedPlatforms = !canCreatePlatforms && creatingPlatforms.length > 0;
  // A file's badges are those of the creative it belongs to (its group leader).
  const leaderOf = (r: State) => {
    const res = resolved.get(r.id);
    return res?.kind === "new" ? rows.find((x) => x.id === res.groupKey) : undefined;
  };
  const leaders = included.filter((r) => leaderOf(r)?.id === r.id);
  const toggleBadgeForAll = (badgeId: string) => {
    const ids = new Set(leaders.map((l) => l.id));
    const allHave = leaders.length > 0 && leaders.every((l) => l.badgeIds.includes(badgeId));
    setRows((list) =>
      list.map((r) =>
        ids.has(r.id)
          ? { ...r, badgeIds: allHave ? r.badgeIds.filter((b) => b !== badgeId) : [...new Set([...r.badgeIds, badgeId])] }
          : r,
      ),
    );
  };

  const confirm = () =>
    startTransition(async () => {
      const res = await confirmImportAction(batchId, {
        items: rows.map((r) => ({
          id: r.id,
          include: r.include,
          versionType: r.versionType,
          creativeName: r.creativeName.trim() || r.filename,
          category: r.category,
          applicationId: r.platform.startsWith(NEW) ? null : r.platform,
          newApplicationName: r.platform.startsWith(NEW) ? r.platform.slice(NEW.length) : null,
          campaignId: r.platform.startsWith(NEW) ? null : r.campaignId,
          badgeIds: leaderOf(r)?.badgeIds ?? [],
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
        <div className="flex flex-wrap gap-2">
          <BulkBadges catalog={catalog} leaders={leaders} onToggle={toggleBadgeForAll} />
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
          <Button
            onClick={confirm}
            disabled={pending || included.length === 0 || undecided.length > 0 || blockedPlatforms}
            data-testid="confirm-import"
          >
            {pending ? <Spinner /> : <CheckCircle2 />}
            Import {included.length} file{included.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
      {creatingPlatforms.length > 0 && (
        <p className={cn("flex items-center gap-2 text-sm", blockedPlatforms ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {blockedPlatforms ? <AlertTriangle className="size-4" /> : <Sparkles className="size-4" />}
          {blockedPlatforms
            ? `Only an administrator can create ${creatingPlatforms.map((n) => `“${n}”`).join(", ")}. Choose an existing platform for these files.`
            : `New platform${creatingPlatforms.length > 1 ? "s" : ""} created on import: ${creatingPlatforms.map((n) => `“${n}”`).join(", ")}.`}
        </p>
      )}
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
                <th className="px-3 py-2 font-medium">Badges</th>
                <th className="px-3 py-2 font-medium">Application</th>
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const peers = rows.filter((o) => o.id !== r.id && o.include && o.platform === r.platform && o.matchKey === r.matchKey);
                const isNewPlatform = r.platform.startsWith(NEW);
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
                          patch(r.id, { association: v === "new" ? { kind: "new", groupKey: r.id } : { kind: "withFile", clientId: v.slice(5) } })
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
                    <td className="min-w-[200px] px-3 py-2 align-top">
                      {leads ? (
                        <BadgeSelect
                          catalog={catalog}
                          value={r.badgeIds}
                          onChange={(ids) => patch(r.id, { badgeIds: ids })}
                          onCreated={addToCatalog}
                          canCreate={canCreateBadges}
                          disabled={!r.include}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Same as its full version</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select value={r.platform} onValueChange={(v) => patch(r.id, { platform: v, campaignId: null })}>
                        <SelectTrigger size="sm" className="w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {applications.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              <span className="size-2 rounded-full" style={{ backgroundColor: a.brandColor }} />
                              {a.name}
                            </SelectItem>
                          ))}
                          {newPlatformNames.length > 0 && (
                            <>
                              <SelectSeparator />
                              <SelectGroup>
                                <SelectLabel>New platform</SelectLabel>
                                {newPlatformNames.map((n) => (
                                  <SelectItem key={n} value={`${NEW}${n}`}>
                                    <Sparkles className="size-3" />
                                    {n}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {isNewPlatform ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">New platform, from folder name</p>
                      ) : (
                        r.suggestedApplicationId === r.platform && <p className="mt-1 text-[11px] text-muted-foreground">From folder name</p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Select
                        value={isNewPlatform ? "none" : (r.campaignId ?? "none")}
                        onValueChange={(v) => patch(r.id, { campaignId: v === "none" ? null : v })}
                        disabled={isNewPlatform}
                      >
                        <SelectTrigger size="sm" className="w-[170px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No campaign</SelectItem>
                          {campaigns
                            .filter((c) => c.applicationId === r.platform)
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

/** Add (or remove) one badge on every selected creative of the import at once. */
function BulkBadges({ catalog, leaders, onToggle }: { catalog: BadgeView[]; leaders: { badgeIds: string[] }[]; onToggle: (badgeId: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={leaders.length === 0} data-testid="bulk-badges">
          <Tags /> Badges
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground">
          Apply to all {leaders.length} selected creative{leaders.length === 1 ? "" : "s"}
        </p>
        <Command>
          <CommandInput placeholder="Search badges…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No badge found.</CommandEmpty>
            <CommandGroup>
              {catalog.map((b) => {
                const count = leaders.filter((l) => l.badgeIds.includes(b.id)).length;
                const all = count === leaders.length && count > 0;
                return (
                  <CommandItem key={b.id} value={b.name} onSelect={() => onToggle(b.id)}>
                    <span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: b.color }}>
                      {all ? <Check className="size-2.5 text-white" strokeWidth={3} /> : count > 0 ? <Minus className="size-2.5 text-white" strokeWidth={3} /> : null}
                    </span>
                    <span className="flex-1 truncate">{b.name}</span>
                    {count > 0 && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
