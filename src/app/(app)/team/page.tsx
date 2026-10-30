import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { UserFormDialog, UserRowActions } from "@/components/team/user-dialogs";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team & Users" };

export default async function TeamPage() {
  const me = await requirePagePermission("user.manage");
  const [users, applications, roleCounts] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        role: true,
        applicationAccess: { include: { application: { select: { id: true, name: true, brandColor: true } } } },
        _count: { select: { createdCreatives: true } },
      },
    }),
    prisma.application.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, brandColor: true } }),
    prisma.user.groupBy({ by: ["roleId"], where: { status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const roles = await prisma.role.findMany();
  const countFor = (key: string) => roleCounts.find((r) => r.roleId === roles.find((x) => x.key === key)?.id)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Team & Users"
        description="Manage who can access the platform, their role and which applications they can see."
        actions={<UserFormDialog applications={applications} />}
      />
      <div className="mb-5 flex flex-wrap gap-2 text-sm">
        {(["ADMIN", "MANAGER", "CREATOR", "VIEWER"] as const).map((r) => (
          <span key={r} className="rounded-full border bg-card px-3 py-1">
            {ROLE_LABELS[r]} <span className="tabular text-muted-foreground">{formatNumber(countFor(r))}</span>
          </span>
        ))}
      </div>
      {/* A table from sm up; on phones each row becomes a card (same markup, no hidden copy). */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm max-sm:block sm:min-w-[860px]">
            <thead className="max-sm:hidden">
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Applications</th>
                <th className="px-3 py-2.5 font-medium">Creatives</th>
                <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y max-sm:block">
              {users.map((u) => {
                const teamUser = {
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  jobTitle: u.jobTitle,
                  role: u.role.key,
                  status: u.status,
                  restrictApplications: u.restrictApplications,
                  applicationIds: u.applicationAccess.map((a) => a.applicationId),
                };
                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-2 max-sm:px-4 max-sm:py-3",
                      u.status === "DISABLED" && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3 max-sm:w-[calc(100%-5.25rem)] max-sm:p-0">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} className="size-8" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {u.name} {u.id === me.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {u.email}
                            {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 max-sm:order-1 max-sm:p-0">
                      <Badge variant={u.role.key === "ADMIN" ? "default" : "secondary"}>{ROLE_LABELS[u.role.key]}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs max-sm:order-1 max-sm:p-0">
                      {u.restrictApplications ? (
                        <span className="flex flex-wrap gap-1">
                          {u.applicationAccess.map((a) => (
                            <span key={a.applicationId} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5">
                              <span className="size-1.5 rounded-full" style={{ backgroundColor: a.application.brandColor }} />
                              {a.application.name}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">All applications</span>
                      )}
                    </td>
                    <td className="tabular px-3 py-3 max-sm:order-1 max-sm:p-0 max-sm:text-xs max-sm:text-muted-foreground">
                      {formatNumber(u._count.createdCreatives)}
                      <span className="sm:hidden"> creatives</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground max-sm:order-1 max-sm:p-0">
                      <span className="sm:hidden">Signed in </span>
                      {u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}
                    </td>
                    <td className="px-3 py-3 max-sm:order-1 max-sm:p-0">
                      {u.status === "ACTIVE" ? (
                        u.mustChangePassword ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">Pending first sign-in</span>
                        ) : (
                          <span className="text-xs text-emerald-700 dark:text-emerald-300">Active</span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">Disabled</span>
                      )}
                    </td>
                    <td className="px-3 py-3 max-sm:ml-auto max-sm:p-0">
                      <div className="flex justify-end gap-1">
                        <UserFormDialog user={teamUser} applications={applications} />
                        <UserRowActions user={teamUser} isSelf={u.id === me.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
