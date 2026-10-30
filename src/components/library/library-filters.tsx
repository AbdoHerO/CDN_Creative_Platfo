"use client";

import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_LABELS, LIBRARY_SORTS, MEDIA_TYPE_LABELS, STATUS_LABELS, STATUS_ORDER } from "@/lib/constants";
import { ACCEPTED_EXTENSIONS } from "@/lib/files/types";
import { formatNumber } from "@/lib/format";
import { updatePreferencesAction } from "@/server/actions/preferences";
import type { LibraryFacets } from "@/server/queries/library";

type Values = {
  q: string;
  app: string;
  campaign: string;
  category: string;
  status: string;
  type: string;
  format: string;
  tag: string;
  uploader: string;
  from: string;
  to: string;
  sort: string;
};

const ALL = "__all";

export function LibraryFilters({
  basePath,
  facets,
  fixed,
  values,
  view,
  showPreviews,
  total,
}: {
  basePath: string;
  facets: LibraryFacets;
  fixed: { status: boolean; app: boolean; campaign: boolean };
  values: Values;
  view: "grid" | "list";
  showPreviews: boolean;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(values.q);
  // Optimistic so rapid clicks never send a stale value while the page refreshes.
  const [previewsOn, setPreviewsOn] = useOptimistic(showPreviews);
  const [savingPreviews, startPreviewTransition] = useTransition();
  const lastPushed = useRef(values.q);

  const update = (patch: Partial<Record<keyof Values | "view", string | null>>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === ALL) sp.delete(key);
      else sp.set(key, value);
    }
    if (patch.app !== undefined && patch.app !== values.app) sp.delete("campaign");
    sp.delete("page");
    const qs = sp.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Debounced search-as-you-type.
  useEffect(() => {
    if (query === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = query;
      update({ q: query.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const campaigns = useMemo(() => facets.campaigns, [facets.campaigns]);

  const chips: { key: keyof Values; label: string }[] = [];
  const appName = facets.applications.find((a) => a.id === values.app)?.name;
  if (values.app && !fixed.app && appName) chips.push({ key: "app", label: `Application: ${appName}` });
  const campaignName = campaigns.find((c) => c.id === values.campaign)?.name;
  if (values.campaign && !fixed.campaign && campaignName) chips.push({ key: "campaign", label: `Campaign: ${campaignName}` });
  if (values.type) chips.push({ key: "type", label: `Type: ${MEDIA_TYPE_LABELS[values.type as keyof typeof MEDIA_TYPE_LABELS]}` });
  if (values.category) chips.push({ key: "category", label: `Category: ${CATEGORY_LABELS[values.category as keyof typeof CATEGORY_LABELS]}` });
  if (values.status && !fixed.status) chips.push({ key: "status", label: `Status: ${STATUS_LABELS[values.status as keyof typeof STATUS_LABELS]}` });
  if (values.tag) chips.push({ key: "tag", label: `Tag: ${facets.tags.find((t) => t.slug === values.tag)?.name ?? values.tag}` });
  if (values.uploader) chips.push({ key: "uploader", label: `Uploaded by: ${facets.uploaders.find((u) => u.id === values.uploader)?.name ?? "user"}` });
  if (values.format) chips.push({ key: "format", label: `Format: ${values.format.toUpperCase()}` });
  if (values.from) chips.push({ key: "from", label: `From ${values.from}` });
  if (values.to) chips.push({ key: "to", label: `Until ${values.to}` });

  const moreCount = [values.tag, values.uploader, values.format, values.from, values.to].filter(Boolean).length;

  const togglePreviews = (checked: boolean) => {
    startPreviewTransition(async () => {
      setPreviewsOn(checked);
      await updatePreferencesAction({ showPreviewVersions: checked });
      router.refresh();
    });
  };

  const setView = (next: string) => {
    if (next !== "grid" && next !== "list") return;
    update({ view: next });
    void updatePreferencesAction({ libraryView: next === "list" ? "LIST" : "GRID" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, filename, tag, keyword, campaign…"
            className="h-9 pl-8 pr-8"
            aria-label="Search creatives"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!fixed.app && (
            <FilterSelect
              label="Application"
              value={values.app}
              onChange={(v) => update({ app: v })}
              options={facets.applications.map((a) => ({ value: a.id, label: a.name, color: a.brandColor }))}
            />
          )}
          {!fixed.campaign && (
            <FilterSelect
              label="Campaign"
              value={values.campaign}
              onChange={(v) => update({ campaign: v })}
              options={campaigns.map((c) => ({ value: c.id, label: values.app ? c.name : `${c.name} · ${c.application}` }))}
            />
          )}
          <FilterSelect
            label="Type"
            value={values.type}
            onChange={(v) => update({ type: v })}
            options={Object.entries(MEDIA_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FilterSelect
            label="Category"
            value={values.category}
            onChange={(v) => update({ category: v })}
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          {!fixed.status && (
            <FilterSelect
              label="Status"
              value={values.status}
              onChange={(v) => update({ status: v })}
              options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                <SlidersHorizontal /> More
                {moreCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-4 px-1.5 text-[10px]">
                    {moreCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Tag</Label>
                <FilterSelect
                  label="Any tag"
                  value={values.tag}
                  onChange={(v) => update({ tag: v })}
                  options={facets.tags.map((t) => ({ value: t.slug, label: t.name }))}
                  full
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Uploaded by</Label>
                <FilterSelect
                  label="Anyone"
                  value={values.uploader}
                  onChange={(v) => update({ uploader: v })}
                  options={facets.uploaders.map((u) => ({ value: u.id, label: u.name }))}
                  full
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">File format</Label>
                <FilterSelect
                  label="Any format"
                  value={values.format}
                  onChange={(v) => update({ format: v })}
                  options={ACCEPTED_EXTENSIONS.map((e) => ({ value: e, label: e.toUpperCase() }))}
                  full
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="from" className="text-xs text-muted-foreground">
                    Uploaded from
                  </Label>
                  <Input id="from" type="date" value={values.from} max={values.to || undefined} onChange={(e) => update({ from: e.target.value || null })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="to" className="text-xs text-muted-foreground">
                    Until
                  </Label>
                  <Input id="to" type="date" value={values.to} min={values.from || undefined} onChange={(e) => update({ to: e.target.value || null })} />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-h-7 flex-wrap items-center gap-1.5">
          <span className="tabular mr-1 text-sm text-muted-foreground">
            {pending || savingPreviews ? <Spinner className="inline size-3.5" /> : null} {formatNumber(total)} result{total === 1 ? "" : "s"}
          </span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update({ [chip.key]: null })}
              className="inline-flex h-6 items-center gap-1 rounded-full border bg-card px-2.5 text-xs transition-colors hover:bg-muted"
            >
              {chip.label}
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
          {(chips.length > 0 || values.q) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setQuery("");
                lastPushed.current = "";
                startTransition(() => router.replace(basePath, { scroll: false }));
              }}
            >
              Clear all
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={previewsOn} onCheckedChange={togglePreviews} disabled={savingPreviews} aria-label="Show preview versions" />
            Show preview versions
          </label>
          <Select value={values.sort} onValueChange={(v) => update({ sort: v === "newest" ? null : v })}>
            <SelectTrigger size="sm" className="w-[170px]" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {Object.entries(LIBRARY_SORTS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={setView} aria-label="View">
            <ToggleGroupItem value="grid" aria-label="Grid view">
              <LayoutGrid />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view">
              <List />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  full,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; color?: string }[];
  onChange: (value: string | null) => void;
  full?: boolean;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger size="sm" className={full ? "h-9 w-full" : "h-9 min-w-[130px] max-w-[220px]"} aria-label={label} data-active={!!value}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{full ? label : `All · ${label}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.color && <span className="size-2 rounded-full" style={{ backgroundColor: o.color }} />}
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
