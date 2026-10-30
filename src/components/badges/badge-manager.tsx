"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createBadgeAction, deleteBadgeAction, updateBadgeAction } from "@/server/actions/badges";
import { BadgeChip } from "./badge-chip";

type Row = { id: string; name: string; color: string; count: number };

/** Settings → Badges: add, rename, recolour and delete badges. */
export function BadgeManager({ badges }: { badges: Row[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", color: "#8B5CF6" });
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      after?.();
      router.refresh();
    });

  const startEdit = (b: Row) => {
    setEditing(b.id);
    setDraft({ name: b.name, color: b.color });
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {badges.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No badges yet.</li>}
        {badges.map((b) =>
          editing === b.id ? (
            <li key={b.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <BadgeForm draft={draft} setDraft={setDraft} />
              <Button size="sm" disabled={pending || !draft.name.trim()} onClick={() => run(() => updateBadgeAction(b.id, draft), () => setEditing(null))}>
                {pending && <Spinner />} Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
                Cancel
              </Button>
            </li>
          ) : (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 items-center gap-3">
                <BadgeChip badge={b} />
                <span className="text-xs text-muted-foreground">
                  {b.count} creative{b.count === 1 ? "" : "s"}
                </span>
              </span>
              <span className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${b.name}`} onClick={() => startEdit(b)}>
                  <Pencil />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${b.name}`}>
                      <Trash2 />
                    </Button>
                  }
                  title={`Delete the badge “${b.name}”?`}
                  description={b.count ? `It is removed from ${b.count} creative${b.count === 1 ? "" : "s"}. The creatives themselves are not changed.` : "No creative uses it."}
                  confirmLabel="Delete badge"
                  destructive
                  onConfirm={async () => {
                    const res = await deleteBadgeAction(b.id);
                    if (!res.ok) {
                      toast.error(res.error);
                      return false;
                    }
                    toast.success(res.message);
                    router.refresh();
                  }}
                />
              </span>
            </li>
          ),
        )}
      </ul>
      {editing === "new" ? (
        <div className="flex flex-wrap items-center gap-2">
          <BadgeForm draft={draft} setDraft={setDraft} />
          <Button size="sm" disabled={pending || !draft.name.trim()} onClick={() => run(() => createBadgeAction(draft), () => setEditing(null))}>
            {pending && <Spinner />} Add badge
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditing("new");
            setDraft({ name: "", color: "#8B5CF6" });
          }}
        >
          <Plus /> New badge
        </Button>
      )}
    </div>
  );
}

function BadgeForm({ draft, setDraft }: { draft: { name: string; color: string }; setDraft: (d: { name: string; color: string }) => void }) {
  return (
    <>
      <input
        type="color"
        value={draft.color}
        onChange={(e) => setDraft({ ...draft, color: e.target.value })}
        className="h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5"
        aria-label="Badge colour"
      />
      <Input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="e.g. Motion graphique"
        maxLength={40}
        className="h-8 w-56"
        aria-label="Badge name"
        autoFocus
      />
    </>
  );
}
