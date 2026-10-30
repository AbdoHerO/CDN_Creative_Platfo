"use client";

import { CheckCheck, Circle, CircleDot, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { deleteReadNotificationsAction, markNotificationsReadAction, markNotificationUnreadAction } from "@/server/actions/notifications";

export function NotificationBulkActions({ unread, read }: { unread: number; read: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending || unread === 0}
        onClick={() =>
          startTransition(async () => {
            const res = await markNotificationsReadAction("all");
            if (!res.ok) toast.error(res.error);
            router.refresh();
          })
        }
      >
        {pending ? <Spinner /> : <CheckCheck />} Mark all read
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending || read === 0}
        onClick={() =>
          startTransition(async () => {
            const res = await deleteReadNotificationsAction();
            if (!res.ok) toast.error(res.error);
            else toast.success(res.message);
            router.refresh();
          })
        }
      >
        <Trash2 /> Clear read
      </Button>
    </div>
  );
}

export function NotificationReadToggle({ id, read }: { id: string; read: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={read ? "Mark as unread" : "Mark as read"}
      title={read ? "Mark as unread" : "Mark as read"}
      onClick={() =>
        startTransition(async () => {
          const res = read ? await markNotificationUnreadAction(id) : await markNotificationsReadAction([id]);
          if (!res.ok) toast.error(res.error);
          router.refresh();
        })
      }
    >
      {read ? <Circle /> : <CircleDot className="text-primary" />}
    </Button>
  );
}
