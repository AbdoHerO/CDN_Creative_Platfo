"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteCampaignAction } from "@/server/actions/campaigns";

export function DeleteCampaignButton({ id, name, creatives }: { id: string; name: string; creatives: number }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label="Delete campaign">
          <Trash2 />
        </Button>
      }
      title={`Delete campaign “${name}”?`}
      description={
        creatives > 0
          ? `Its ${creatives} creative(s) are kept and simply no longer linked to a campaign.`
          : "This campaign has no creatives."
      }
      confirmLabel="Delete campaign"
      destructive
      onConfirm={async () => {
        const res = await deleteCampaignAction(id);
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        toast.success(res.message);
        router.push("/campaigns");
        router.refresh();
      }}
    />
  );
}
