import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { can, permissionsFor } from "@/lib/permissions";
import { creativeVisibilityWhere } from "@/lib/visibility";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/change-password");

  const reviewer = can(user.role, "creative.review");
  const visible = creativeVisibilityWhere(user);
  const [queueCount, unreadCount] = await Promise.all([
    prisma.creative.count({
      where: {
        AND: [visible, { status: { in: ["PENDING", "IN_REVIEW"] } }, reviewer ? {} : { createdById: user.id }],
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        user={{ name: user.name, email: user.email, role: user.role, jobTitle: user.jobTitle }}
        permissions={permissionsFor(user.role)}
        queueCount={queueCount}
      />
      <SidebarInset className="min-w-0">
        <TopBar
          user={{ name: user.name, email: user.email, role: user.role }}
          canUpload={can(user.role, "creative.upload")}
          initialUnread={unreadCount}
        />
        <div className="flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
