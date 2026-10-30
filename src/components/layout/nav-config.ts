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
import type { RoleKey } from "@/generated/prisma/enums";
import type { Permission } from "@/lib/permissions";

/** Navigation shared by the desktop sidebar and the mobile menu. */
export type NavItem = { title: string; href: string; icon: LucideIcon; permission?: Permission; badge?: "queue" };

export const NAV: { label: string; items: NavItem[] }[] = [
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

/** Groups and items the user may see (the server enforces the same rules). */
export function visibleNav(role: RoleKey, permissions: Permission[]) {
  return NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => {
      if (item.permission && !permissions.includes(item.permission)) return false;
      // Viewers only ever see approved creatives; hide queues that would always be empty.
      if (role === "VIEWER" && ["/validation", "/declined", "/archived"].includes(item.href)) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);
}
