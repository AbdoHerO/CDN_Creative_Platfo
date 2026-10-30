"use client";

import { Link2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/creatives/status-badge";
import { CreativeLookupDialog } from "@/components/upload/creative-lookup-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CreativeStatus } from "@/generated/prisma/enums";
import { moveFileAction } from "@/server/actions/creatives";

/**
 * Shown on creatives that only have preview files (preview uploaded before the
 * full version). Lets the user link the preview to its full creative.
 */
export function LinkPreviewCard({
  creativeId,
  applicationId,
  fileIds,
  targets,
  canEdit,
}: {
  creativeId: string;
  applicationId: string;
  fileIds: string[];
  targets: { id: string; name: string; status: CreativeStatus }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [lookup, setLookup] = useState(false);
  const [pending, startTransition] = useTransition();

  const link = (targetId: string, targetName: string) =>
    startTransition(async () => {
      for (const fileId of fileIds) {
        const res = await moveFileAction(fileId, { targetCreativeId: targetId });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
      }
      toast.success(`Preview linked to “${targetName}”.`);
      router.push(`/creatives/${targetId}`);
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/25 dark:bg-amber-500/5">
      <div className="flex items-start gap-3">
        <Unlink className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium">Unmatched preview</p>
            <p className="text-sm text-muted-foreground">
              This creative only has a preview version. It is hidden from the library until its full version is uploaded — uploading a
              file with the same name links it automatically, or link it to an existing creative now.
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {targets.map((t) => (
                <Button key={t.id} size="sm" variant="outline" disabled={pending} onClick={() => link(t.id, t.name)}>
                  {pending ? <Spinner /> : <Link2 />} Link to “{t.name}” <StatusBadge status={t.status} />
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setLookup(true)} disabled={pending}>
                Choose another creative…
              </Button>
            </div>
          )}
        </div>
      </div>
      <CreativeLookupDialog
        open={lookup}
        onOpenChange={setLookup}
        applicationId={applicationId}
        excludeId={creativeId}
        title="Link this preview to a creative"
        onSelect={(c) => {
          setLookup(false);
          link(c.id, c.name);
        }}
      />
    </div>
  );
}
