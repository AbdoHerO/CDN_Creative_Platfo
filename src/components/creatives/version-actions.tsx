"use client";

import { Download, Link2, MoreHorizontal, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CreativeLookupDialog } from "@/components/upload/creative-lookup-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteFileAction, moveFileAction, setCurrentFileAction } from "@/server/actions/creatives";

/** Per-version actions: download, make current, link to another creative, delete. */
export function VersionActions({
  file,
  creativeId,
  applicationId,
  canEdit,
  canDelete,
}: {
  file: { id: string; isCurrent: boolean; originalFilename: string; versionType: string; versionNumber: number };
  creativeId: string;
  applicationId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [lookup, setLookup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const makeCurrent = async () => {
    const res = await setCurrentFileAction(file.id, creativeId);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else toast.error(res.error);
  };

  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon-sm" aria-label={`Download ${file.originalFilename}`}>
        <a href={`/api/files/${file.id}/download`}>
          <Download />
        </a>
      </Button>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More version actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!file.isCurrent && (
              <DropdownMenuItem onSelect={makeCurrent}>
                <Star /> Make current version
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setLookup(true)}>
              <Link2 /> Move to another creative…
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete version
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <CreativeLookupDialog
        open={lookup}
        onOpenChange={setLookup}
        applicationId={applicationId}
        excludeId={creativeId}
        title={`Move ${file.originalFilename}`}
        onSelect={async (target) => {
          const res = await moveFileAction(file.id, { targetCreativeId: target.id });
          setLookup(false);
          if (!res.ok) return toast.error(res.error);
          toast.success(`Linked to “${target.name}”.`);
          router.push(res.data.sourceDeleted ? `/creatives/${target.id}` : `/creatives/${creativeId}`);
          router.refresh();
        }}
      />
      <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this version?"
          description={`${file.originalFilename} will be permanently removed from storage. This cannot be undone.`}
          confirmLabel="Delete version"
          destructive
          onConfirm={async () => {
            const res = await deleteFileAction(file.id, creativeId);
            if (!res.ok) {
              toast.error(res.error);
              return false;
            }
            toast.success(res.message);
            router.refresh();
          }}
        />
    </div>
  );
}
