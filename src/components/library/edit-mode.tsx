"use client";

import { CheckCheck, CheckCircle2, ListChecks, Minus, Send, SquareCheckBig, Tags, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BadgeSelect } from "@/components/badges/badge-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { CreativeStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { BULK_FROM, type BulkAction } from "@/lib/workflow";
import { bulkBadgeAction, setCreativeBadgesAction } from "@/server/actions/badges";
import { bulkWorkflowAction } from "@/server/actions/creatives";
import type { BadgeView } from "@/server/services/badges";

/**
 * Selection mode of the library and the validation queue. Cards are tapped to
 * select them and a floating bar acts on the selection: submit or approve them
 * (reviewers; approving a draft submits it first), and for admins and managers
 * add or remove a badge, with badges also editable directly on each card. On a
 * validation tab, a bar above the cards does the same for every matching
 * creative at once ("Submit all", "Approve all").
 */
type BulkTab = { status: Extract<CreativeStatus, "DRAFT" | "DECLINED" | "PENDING" | "IN_REVIEW">; count: number };

type EditState = {
  enabled: boolean;
  /** Admins and managers: edit badges on cards and in bulk. */
  badges: boolean;
  /** Validation actions offered for the selection. */
  actions: BulkAction[];
  /** The validation tab, for the "all" buttons. */
  tab: BulkTab | null;
  editing: boolean;
  setEditing: (v: boolean) => void;
  selected: Set<string>;
  toggle: (id: string) => void;
  setSelected: (ids: string[]) => void;
  catalog: BadgeView[];
  addToCatalog: (b: BadgeView) => void;
  canCreate: boolean;
  pageIds: string[];
};

const EditContext = createContext<EditState>({
  enabled: false,
  badges: false,
  actions: [],
  tab: null,
  editing: false,
  setEditing: () => undefined,
  selected: new Set(),
  toggle: () => undefined,
  setSelected: () => undefined,
  catalog: [],
  addToCatalog: () => undefined,
  canCreate: false,
  pageIds: [],
});

export const useLibraryEdit = () => useContext(EditContext);

export function LibraryEditProvider({
  badges,
  actions,
  tab = null,
  catalog: initialCatalog,
  canCreate,
  pageIds,
  children,
}: {
  badges: boolean;
  actions: BulkAction[];
  tab?: BulkTab | null;
  catalog: BadgeView[];
  canCreate: boolean;
  pageIds: string[];
  children: React.ReactNode;
}) {
  const [editing, setEditingState] = useState(false);
  const [selected, setSelectedState] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState(initialCatalog);
  const enabled = badges || actions.length > 0;
  const value = useMemo<EditState>(
    () => ({
      enabled,
      badges,
      actions,
      tab,
      editing,
      setEditing: (v) => {
        setEditingState(v);
        if (!v) setSelectedState(new Set());
      },
      selected,
      toggle: (id) =>
        setSelectedState((s) => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setSelected: (ids) => setSelectedState(new Set(ids)),
      catalog,
      addToCatalog: (b) => setCatalog((list) => (list.some((x) => x.id === b.id) ? list : [...list, b])),
      canCreate,
      pageIds,
    }),
    [enabled, badges, actions, tab, editing, selected, catalog, canCreate, pageIds],
  );
  return (
    <EditContext.Provider value={value}>
      {children}
      {enabled && editing && (
        <>
          {/* Room to scroll the last cards above the floating bar. */}
          <div className="h-36 md:h-20" aria-hidden />
          <SelectionBar />
        </>
      )}
    </EditContext.Provider>
  );
}

export function EditModeToggle() {
  const { enabled, badges, actions, editing, setEditing } = useLibraryEdit();
  if (!enabled) return null;
  const badgesOnly = badges && actions.length === 0;
  return (
    <Button variant={editing ? "default" : "outline"} size="sm" className="h-8 gap-1.5" onClick={() => setEditing(!editing)} data-testid="edit-mode">
      {editing ? <CheckCheck /> : badgesOnly ? <Tags /> : <SquareCheckBig />}
      {editing ? "Done" : badgesOnly ? "Edit badges" : "Select"}
    </Button>
  );
}

const ACTION_LABELS: Record<BulkAction, string> = { submit: "Submit", approve: "Approve" };

type Confirm = { action: BulkAction; scope: "selection" | "all"; count: number };

function confirmText({ action, scope, count }: Confirm, tab: BulkTab | null) {
  const n = `${count} creative${count === 1 ? "" : "s"}`;
  const where = scope === "all" ? " Every creative of this tab that matches the current search and filters is included, on every page." : "";
  const draftsFirst = scope === "selection" || tab?.status === "DRAFT" || tab?.status === "DECLINED";
  return action === "approve"
    ? {
        title: scope === "all" ? `Approve all ${n}?` : `Approve ${n}?`,
        body: `${draftsFirst ? "Drafts are submitted first, then approved. " : ""}Each step is recorded in the validation history, and viewers will see them as approved.${where}`,
      }
    : {
        title: scope === "all" ? `Submit all ${n} for validation?` : `Submit ${n} for validation?`,
        body: `They move to Pending, and reviewers get one notification for the whole batch.${where}`,
      };
}

/** Runs a bulk validation action on the selection or on the whole tab, after confirmation. */
function useBulkWorkflow() {
  const router = useRouter();
  const search = useSearchParams();
  const { selected, setSelected, tab } = useLibraryEdit();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const run = (c: Confirm) =>
    startTransition(async () => {
      const res = await bulkWorkflowAction(
        c.scope === "all" && tab
          ? { action: c.action, all: { status: tab.status, search: Object.fromEntries(search.entries()) } }
          : { action: c.action, ids: [...selected] },
      );
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      setSelected([]);
      router.refresh();
    });

  const text = confirm && confirmText(confirm, tab);
  const dialog = confirm && text && (
    <AlertDialog open onOpenChange={(open) => !open && !pending && setConfirm(null)}>
      <AlertDialogContent data-testid="bulk-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              run(confirm);
            }}
            data-testid="bulk-confirm-action"
          >
            {pending && <Spinner />}
            {ACTION_LABELS[confirm.action]}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    pending,
    dialog,
    /** Submitting a selection is quick and reversible (withdraw); approving and "all" ask first. */
    start: (c: Confirm) => (c.action === "submit" && c.scope === "selection" ? run(c) : setConfirm(c)),
  };
}

/** Badges of one card, edited in place (saved immediately). */
export function CardBadgeEditor({ creativeId, badges }: { creativeId: string; badges: { id: string }[] }) {
  const router = useRouter();
  const { catalog, addToCatalog, canCreate } = useLibraryEdit();
  const [value, setValue] = useState(badges.map((b) => b.id));
  const [pending, startTransition] = useTransition();
  const save = (next: string[]) => {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await setCreativeBadgesAction(creativeId, next);
      if (!res.ok) {
        setValue(previous);
        toast.error(res.error);
      } else router.refresh();
    });
  };
  return (
    <BadgeSelect
      catalog={catalog}
      value={value}
      onChange={save}
      onCreated={addToCatalog}
      canCreate={canCreate}
      disabled={pending}
      removable
      placeholder="Badge"
      className="mt-1.5"
    />
  );
}

/** Above the cards of a validation tab: act on every matching creative at once. */
export function BulkTabBar() {
  const { tab, actions, editing, setEditing } = useLibraryEdit();
  const bulk = useBulkWorkflow();
  const available = actions.filter((a) => tab && BULK_FROM[a].includes(tab.status));
  if (!tab || tab.count === 0 || available.length === 0) return null;
  const n = tab.count;
  const title = {
    DRAFT: `${n} draft${n === 1 ? "" : "s"} not submitted yet`,
    DECLINED: `${n} declined creative${n === 1 ? "" : "s"}`,
    PENDING: `${n} creative${n === 1 ? "" : "s"} waiting for validation`,
    IN_REVIEW: `${n} creative${n === 1 ? "" : "s"} in review`,
  }[tab.status];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-xs sm:gap-3 sm:p-4" data-testid="bulk-tab-bar">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <ListChecks className="size-5" />
      </span>
      <div className="mr-auto min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">
          Move them all forward at once, or{" "}
          <button type="button" onClick={() => setEditing(!editing)} className="font-medium text-primary underline-offset-2 hover:underline">
            {editing ? "stop selecting" : "select some"}
          </button>
          .
        </p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
        {available.includes("submit") && (
          <Button
            variant={available.includes("approve") ? "outline" : "default"}
            disabled={bulk.pending}
            onClick={() => bulk.start({ action: "submit", scope: "all", count: n })}
            data-testid="bulk-all-submit"
          >
            <Send /> Submit all
          </Button>
        )}
        {available.includes("approve") && (
          <Button disabled={bulk.pending} onClick={() => bulk.start({ action: "approve", scope: "all", count: n })} data-testid="bulk-all-approve">
            <CheckCircle2 /> Approve all
          </Button>
        )}
      </div>
      {bulk.dialog}
    </div>
  );
}

function SelectionBar() {
  const router = useRouter();
  const { selected, setSelected, setEditing, pageIds, catalog, addToCatalog, canCreate, badges, actions } = useLibraryEdit();
  const [pending, startTransition] = useTransition();
  const bulk = useBulkWorkflow();
  const ids = [...selected];
  const count = ids.length;
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const busy = pending || bulk.pending;

  const bulkBadge = (badgeId: string, mode: "add" | "remove") =>
    startTransition(async () => {
      const res = await bulkBadgeAction(ids, badgeId, mode);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 mx-auto max-w-3xl md:bottom-6"
      role="toolbar"
      aria-label="Act on selected creatives"
      data-testid="selection-bar"
    >
      <div className="space-y-2 rounded-2xl bg-neutral-900/95 p-2 pl-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="mr-auto text-sm font-semibold tabular-nums">
            {busy && <Spinner className="mr-1.5 inline size-3.5" />}
            {count ? `${count} selected` : "Tap cards to select"}
          </span>
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : pageIds)}
            className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            {allSelected ? "Unselect all" : "Select page"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Exit edit mode"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.includes("submit") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 rounded-full"
              disabled={busy || !count}
              onClick={() => bulk.start({ action: "submit", scope: "selection", count })}
              data-testid="bulk-submit"
            >
              <Send /> Submit
            </Button>
          )}
          {actions.includes("approve") && (
            <Button
              size="sm"
              className="h-8 rounded-full bg-emerald-500 text-white hover:bg-emerald-600"
              disabled={busy || !count}
              onClick={() => bulk.start({ action: "approve", scope: "selection", count })}
              data-testid="bulk-approve"
            >
              <CheckCircle2 /> Approve
            </Button>
          )}
          {badges && (
            <>
              <span className={cn(!count && "pointer-events-none opacity-40")}>
                <BadgeSelect
                  catalog={catalog}
                  value={[]}
                  onChange={(next) => next[0] && bulkBadge(next[0], "add")}
                  onCreated={addToCatalog}
                  canCreate={canCreate}
                  compact
                  closeOnSelect
                  placeholder="Add badge"
                  disabled={busy || !count}
                  className="[&_button]:h-8 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:px-3 [&_button]:text-xs [&_button]:text-white"
                />
              </span>
              <RemoveBadge catalog={catalog} disabled={busy || !count} onPick={(id) => bulkBadge(id, "remove")} />
            </>
          )}
        </div>
      </div>
      {bulk.dialog}
    </div>
  );
}

function RemoveBadge({ catalog, disabled, onPick }: { catalog: BadgeView[]; disabled: boolean; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-8 items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3 text-xs font-medium disabled:opacity-40"
        >
          <Minus className="size-3" /> Remove badge
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end" side="top">
        <Command>
          <CommandInput placeholder="Badge to remove…" />
          <CommandList>
            <CommandEmpty>No badge found.</CommandEmpty>
            <CommandGroup>
              {catalog.map((b) => (
                <CommandItem
                  key={b.id}
                  value={b.name}
                  onSelect={() => {
                    setOpen(false);
                    onPick(b.id);
                  }}
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: b.color }} />
                  {b.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** List view: badges as chips, or a selection checkbox (and editable badges) in selection mode. */
export function ListRowBadges({ creativeId, badges, children }: { creativeId: string; badges: { id: string }[]; children: React.ReactNode }) {
  const { editing, selected, toggle, badges: canEditBadges } = useLibraryEdit();
  if (!editing) return <>{children}</>;
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <input type="checkbox" checked={selected.has(creativeId)} onChange={() => toggle(creativeId)} className="mt-1 size-4 accent-primary" aria-label="Select" />
      {canEditBadges ? <CardBadgeEditor key={badges.map((b) => b.id).join()} creativeId={creativeId} badges={badges} /> : children}
    </div>
  );
}
