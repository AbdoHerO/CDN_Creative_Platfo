"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BrandMark, BrandName } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/constants";
import type { RoleKey } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/permissions";
import { UserAvatar } from "@/components/common/user-avatar";
import { visibleNav } from "./nav-config";

export function AppSidebar({
  user,
  permissions,
  queueCount,
}: {
  user: { name: string; email: string; role: RoleKey; jobTitle: string | null };
  permissions: Permission[];
  queueCount: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const { setOpenMobile } = useSidebar();
  // If the drawer version is ever opened on a small screen, close it on navigation.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1.5 group-data-[collapsible=icon]:px-0">
          <BrandMark />
          <BrandName className="text-[15px] group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        {visibleNav(user.role, permissions).map(({ label, items }) => {
          const group = { label };
          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {item.badge === "queue" && queueCount > 0 && (
                        <SidebarMenuBadge className="tabular rounded-full bg-primary/10 text-primary">
                          {queueCount > 99 ? "99+" : queueCount}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" isActive={isActive("/profile")} tooltip="Your profile">
              <Link href="/profile">
                <UserAvatar name={user.name} className="size-8" />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
