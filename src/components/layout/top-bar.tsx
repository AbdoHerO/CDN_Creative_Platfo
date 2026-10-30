"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { RoleKey } from "@/generated/prisma/enums";
import { GlobalSearch } from "./global-search";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

export function TopBar({
  user,
  canUpload,
  initialUnread,
}: {
  user: { name: string; email: string; role: RoleKey };
  canUpload: boolean;
  initialUnread: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-5 data-[orientation=vertical]:h-5" />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        {canUpload && (
          <Button asChild size="sm" className="gap-1.5">
            <Link href="/upload">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Upload</span>
            </Link>
          </Button>
        )}
        <NotificationsMenu initialUnread={initialUnread} />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
