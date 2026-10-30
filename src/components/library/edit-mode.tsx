"use client";

import { CheckCheck, Minus, Send, Tags, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BadgeSelect } from "@/components/badges/badge-select";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { bulkBadgeAction, setCreativeBadgesAction } from "@/server/actions/badges";
import { bulkSubmitAction } from "@/server/actions/creatives";
import type { BadgeView } from "@/server/services/badges";

/**
 * Library edit mode (admins and managers): badges are edited directly on each
 * card, cards can be selected, and a floating bar applies a badge to the whole
 * selection or submits it for validation.
 */
type EditState = {
  enabled: boolean;
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
  enabled,
  catalog: initialCatalog,
  canCreate,
  pageIds,
  children,
}: {
  enabled: boolean;
  catalog: BadgeView[];
  canCreate: boolean;
  pageIds: string[];
  children: React.ReactNode;
}) {
  const [editing, setEditingState] = useState(false);
  const [selected, setSelectedState] = useState<Set<string>>(new Set());
  const [catalog, setCatalog] = useState(initialCatalog);
  const value = useMemo<EditState>(
    () => ({
      enabled,
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
    [enabled, editing, selected, catalog, canCreate, pageIds],
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
  const { enabled, editing, setEditing } = useLibraryEdit();
  if (!enabled) return null;
  return (
    <Button
      variant={editing ? "default" : "outline"}
      size="sm"
      className="h-8 gap-1.5"
      onClick={() => setEditing(!editing)}
      data-testid="edit-mode"
    >
      {editing ? <CheckCheck /> : <Tags />}
      {editing ? "Done" : "Edit badges"}
    </Button>
  );
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

function SelectionBar() {
  const router = useRouter();
  const { selected, setSelected, setEditing, pageIds, catalog, addToCatalog, canCreate } = useLibraryEdit();
  const [pending, startTransition] = useTransition();
  const ids = [...selected];
  const count = ids.length;
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const bulk = (badgeId: string, mode: "add" | "remove") =>
    startTransition(async () => {
      const res = await bulkBadgeAction(ids, badgeId, mode);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  const submit = () =>
    startTransition(async () => {
      const res = await bulkSubmitAction(ids);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 mx-auto max-w-3xl md:bottom-6"
      role="toolbar"
      aria-label="Edit selected creatives"
      data-testid="selection-bar"
    >
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-neutral-900/95 p-2 pl-3 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl">
        <span className="mr-auto text-sm font-semibold tabular-nums">
          {pending && <Spinner className="mr-1.5 inline size-3.5" />}
          {count ? `${count} selected` : "Tap cards to select"}
        </span>
        <button
          type="button"
          onClick={() => setSelected(allSelected ? [] : pageIds)}
          className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {allSelected ? "Unselect all" : "Select page"}
        </button>
        <span className={cn(!count && "pointer-events-none opacity-40")}>
          <BadgeSelect
            catalog={catalog}
            value={[]}
            onChange={(next) => next[0] && bulk(next[0], "add")}
            onCreated={addToCatalog}
            canCreate={canCreate}
            compact
            closeOnSelect
            placeholder="Add badge"
            disabled={pending || !count}
            className="[&_button]:h-8 [&_button]:border-white/25 [&_button]:bg-white/10 [&_button]:px-3 [&_button]:text-xs [&_button]:text-white"
          />
        </span>
        <RemoveBadge catalog={catalog} disabled={pending || !count} onPick={(id) => bulk(id, "remove")} />
        <Button size="sm" variant="secondary" className="h-8 rounded-full" disabled={pending || !count} onClick={submit} data-testid="bulk-submit">
          <Send /> Submit
        </Button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex size-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
          aria-label="Exit edit mode"
        >
          <X className="size-4" />
        </button>
      </div>
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

/** List view: badges as chips, or editable with a selection checkbox in edit mode. */
export function ListRowBadges({ creativeId, badges, children }: { creativeId: string; badges: { id: string }[]; children: React.ReactNode }) {
  const { editing, selected, toggle } = useLibraryEdit();
  if (!editing) return <>{children}</>;
  return (
    <div className="mt-1.5 flex items-start gap-2">
      <input
        type="checkbox"
        checked={selected.has(creativeId)}
        onChange={() => toggle(creativeId)}
        className="mt-1 size-4 accent-primary"
        aria-label="Select"
      />
      <CardBadgeEditor key={badges.map((b) => b.id).join()} creativeId={creativeId} badges={badges} />
    </div>
  );
}
