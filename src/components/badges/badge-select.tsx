"use client";

import { Check, Plus, Tags } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createBadgeAction } from "@/server/actions/badges";
import type { BadgeView } from "@/server/services/badges";
import { BadgeChip } from "./badge-chip";

export const BADGE_COLORS = ["#8B5CF6", "#0EA5E9", "#F59E0B", "#10B981", "#EF4444", "#EC4899", "#6366F1", "#64748B"];

/**
 * Multi-select of badges with their colours. Shows the selected badges as
 * chips; the popover lists every badge (search, tick on/off) and, for admins and
 * managers, creates a new badge with a chosen colour.
 */
export function BadgeSelect({
  catalog,
  value,
  onChange,
  onCreated,
  canCreate,
  disabled,
  compact,
  placeholder = "Add badge",
  className,
}: {
  catalog: BadgeView[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Called with a badge created from this select (to add it to the shared catalog). */
  onCreated?: (badge: BadgeView) => void;
  canCreate: boolean;
  disabled?: boolean;
  /** Only the trigger button, without the selected chips. */
  compact?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [color, setColor] = useState(BADGE_COLORS[catalog.length % BADGE_COLORS.length]);
  const [creating, startCreate] = useTransition();
  const selected = catalog.filter((b) => value.includes(b.id));
  const name = query.trim();
  const exists = catalog.some((b) => b.name.toLowerCase() === name.toLowerCase());

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const create = () =>
    startCreate(async () => {
      const res = await createBadgeAction({ name, color });
      if (!res.ok) return void toast.error(res.error);
      onCreated?.(res.data);
      onChange([...value, res.data.id]);
      setQuery("");
      setColor(BADGE_COLORS[(catalog.length + 1) % BADGE_COLORS.length]);
      toast.success(`Badge “${res.data.name}” created.`);
    });

  return (
    // A span, not a div: the select is also used inside paragraph text (page header).
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {!compact && selected.map((b) => <BadgeChip key={b.id} badge={b} />)}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn("h-6 gap-1 rounded-full border-dashed px-2 text-[11px] font-medium text-muted-foreground", selected.length > 0 && !compact && "px-1.5")}
            aria-label={selected.length ? "Edit badges" : placeholder}
            data-testid="badge-select"
          >
            {creating ? <Spinner className="size-3" /> : selected.length && !compact ? <Plus className="size-3" /> : <Tags className="size-3" />}
            {(compact || selected.length === 0) && placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command>
            <CommandInput placeholder={canCreate ? "Search or create a badge…" : "Search badges…"} value={query} onValueChange={setQuery} />
            <CommandList className="max-h-72">
              <CommandEmpty>{canCreate && name ? "No badge with this name yet." : "No badge found."}</CommandEmpty>
              {catalog.length > 0 && (
                <CommandGroup heading="Badges">
                  {catalog.map((b) => {
                    const on = value.includes(b.id);
                    return (
                      <CommandItem key={b.id} value={b.name} onSelect={() => toggle(b.id)}>
                        <span
                          className="flex size-4 shrink-0 items-center justify-center rounded-full ring-2 ring-offset-1 ring-offset-popover"
                          style={{ backgroundColor: b.color, ["--tw-ring-color" as string]: on ? b.color : "transparent" }}
                        >
                          {on && <Check className="size-2.5 text-white" strokeWidth={3} />}
                        </span>
                        <span className={cn("flex-1 truncate", on && "font-medium")}>{b.name}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {canCreate && name && !exists && (
                <>
                  <CommandSeparator />
                  <div className="space-y-2 p-2">
                    <p className="px-1 text-xs text-muted-foreground">New badge colour</p>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {BADGE_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          className={cn("size-5 rounded-full ring-2 ring-offset-2 ring-offset-popover transition-transform hover:scale-110", c === color ? "" : "ring-transparent")}
                          style={{ backgroundColor: c, ["--tw-ring-color" as string]: c === color ? c : "transparent" }}
                          aria-label={`Colour ${c}`}
                        />
                      ))}
                    </div>
                  </div>
                  <CommandGroup>
                    <CommandItem value={`__create ${name}`} onSelect={create} disabled={creating}>
                      <Plus />
                      Create
                      <BadgeChip badge={{ name, color }} />
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </span>
  );
}
