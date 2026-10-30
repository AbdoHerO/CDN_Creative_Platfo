"use client";

import { Laptop } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { revokeSessionAction } from "@/server/actions/auth";

function describe(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export function SessionList({ sessions }: { sessions: { id: string; current: boolean; userAgent: string | null; ipAddress: string | null; lastSeenAt: string; createdAt: string }[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <ul className="divide-y">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <Laptop className="size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {describe(s.userAgent)} {s.current && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">THIS DEVICE</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.ipAddress ? `${s.ipAddress} · ` : ""}active {timeAgo(s.lastSeenAt)} · signed in {timeAgo(s.createdAt)}
              </p>
            </div>
          </div>
          {!s.current && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await revokeSessionAction(s.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(res.message);
                  router.refresh();
                })
              }
            >
              Sign out
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
