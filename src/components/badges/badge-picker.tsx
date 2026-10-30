"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setCreativeBadgesAction } from "@/server/actions/badges";
import type { BadgeView } from "@/server/services/badges";
import { BadgeSelect } from "./badge-select";

/** Badges of one creative, edited in place: every change is saved immediately. */
export function BadgePicker({
  creativeId,
  badges,
  selectedIds,
  canManage,
}: {
  creativeId: string;
  badges: BadgeView[];
  selectedIds: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [catalog, setCatalog] = useState(badges);
  const [selected, setSelected] = useState(selectedIds);
  const [pending, startTransition] = useTransition();

  const save = (next: string[]) => {
    const previous = selected;
    setSelected(next);
    startTransition(async () => {
      const res = await setCreativeBadgesAction(creativeId, next);
      if (!res.ok) {
        setSelected(previous);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <span data-testid="edit-badges-wrap">
      <BadgeSelect
        catalog={catalog}
        value={selected}
        onChange={save}
        onCreated={(b) => setCatalog((list) => [...list, b])}
        canCreate={canManage}
        disabled={pending}
      />
    </span>
  );
}
