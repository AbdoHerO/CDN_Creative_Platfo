"use client";

import { ImageUp, Power, PowerOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { removeApplicationLogoAction, setApplicationStatusAction, uploadApplicationLogoAction } from "@/server/actions/applications";

export function ApplicationAdminControls({ id, name, status, hasLogo }: { id: string; name: string; status: "ACTIVE" | "DISABLED"; hasLogo: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const upload = (file: File) =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("logo", file);
      const res = await uploadApplicationLogoAction(id, fd);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.svg"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={pending}>
        {pending ? <Spinner /> : <ImageUp />} {hasLogo ? "Change logo" : "Upload logo"}
      </Button>
      {hasLogo && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove logo"
          onClick={() =>
            startTransition(async () => {
              const res = await removeApplicationLogoAction(id);
              if (!res.ok) toast.error(res.error);
              else router.refresh();
            })
          }
        >
          <Trash2 />
        </Button>
      )}
      <ConfirmDialog
        trigger={
          <Button variant="outline">
            {status === "ACTIVE" ? <PowerOff /> : <Power />}
            {status === "ACTIVE" ? "Disable" : "Enable"}
          </Button>
        }
        title={status === "ACTIVE" ? `Disable ${name}?` : `Enable ${name}?`}
        description={
          status === "ACTIVE"
            ? "Existing creatives stay available, but no new creatives can be uploaded for this application."
            : "The application will accept uploads again."
        }
        confirmLabel={status === "ACTIVE" ? "Disable" : "Enable"}
        destructive={status === "ACTIVE"}
        onConfirm={async () => {
          const res = await setApplicationStatusAction(id, status === "ACTIVE" ? "DISABLED" : "ACTIVE");
          if (!res.ok) {
            toast.error(res.error);
            return false;
          }
          toast.success(res.message);
          router.refresh();
        }}
      />
    </>
  );
}
