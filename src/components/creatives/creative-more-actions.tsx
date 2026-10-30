"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { WorkflowAction } from "@/lib/workflow";
import { deleteCreativeAction, transitionCreativeAction } from "@/server/actions/creatives";

export function CreativeMoreActions({
  creativeId,
  name,
  actions,
  canDelete,
}: {
  creativeId: string;
  name: string;
  actions: WorkflowAction[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"archive" | "restore" | "delete" | null>(null);
  const canArchive = actions.includes("archive");
  const canRestore = actions.includes("restore");
  if (!canArchive && !canRestore && !canDelete) return null;

  const transition = async (action: "archive" | "restore") => {
    const res = await transitionCreativeAction(creativeId, { action });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(action === "archive" ? "Creative archived." : "Creative restored.");
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canArchive && (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}>
              <Archive /> Archive
            </DropdownMenuItem>
          )}
          {canRestore && (
            <DropdownMenuItem onSelect={() => setConfirm("restore")}>
              <ArchiveRestore /> Restore
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              {(canArchive || canRestore) && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                <Trash2 /> Delete permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Archive “${name}”?`}
        description="Archived creatives are hidden from the library and queues but kept with all versions. You can restore them later."
        confirmLabel="Archive"
        onConfirm={() => transition("archive")}
      />
      <ConfirmDialog
        open={confirm === "restore"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Restore “${name}”?`}
        description="The creative returns to the status it had before archiving."
        confirmLabel="Restore"
        onConfirm={() => transition("restore")}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Delete “${name}” permanently?`}
        description="All versions are removed from storage and the creative is deleted. The activity log keeps a record. This cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          const res = await deleteCreativeAction(creativeId);
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(res.message);
          router.push("/library");
          router.refresh();
        }}
      />
    </>
  );
}
