"use client";

import {
  Activity,
  AppWindow,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  HardDrive,
  LayoutDashboard,
  Library,
  Settings,
  Upload,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/constants";
import type { RoleKey } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/permissions";
import { UserAvatar } from "@/components/common/user-avatar";

type NavItem = { title: string; href: string; icon: LucideIcon; permission?: Permission; badge?: "queue" };

const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Creative Library", href: "/library", icon: Library },
      { title: "Upload", href: "/upload", icon: Upload, permission: "creative.upload" },
    ],
  },
  {
    label: "Organize",
    items: [
      { title: "Applications", href: "/applications", icon: AppWindow },
      { title: "Campaigns", href: "/campaigns", icon: FolderKanban },
    ],
  },
  {
    label: "Validation",
    items: [
      { title: "Pending Validation", href: "/validation", icon: ClipboardCheck, badge: "queue" },
      { title: "Approved", href: "/approved", icon: CheckCircle2 },
      { title: "Declined", href: "/declined", icon: XCircle },
      { title: "Archived", href: "/archived", icon: Archive },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Team & Users", href: "/team", icon: Users, permission: "user.manage" },
      { title: "Activity History", href: "/activity", icon: Activity, permission: "activity.view" },
      { title: "Storage", href: "/storage", icon: HardDrive, permission: "storage.view" },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

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
  const viewerOnly = user.role === "VIEWER";

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-1.5 group-data-[collapsible=icon]:px-0">
          <BrandMark />
          <BrandName className="text-[15px] group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        {NAV.map((group) => {
          const items = group.items.filter((item) => {
            if (item.permission && !permissions.includes(item.permission)) return false;
            // Viewers only ever see approved creatives; hide queues that would always be empty.
            if (viewerOnly && ["/validation", "/declined", "/archived"].includes(item.href)) return false;
            return true;
          });
          if (items.length === 0) return null;
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
