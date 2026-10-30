import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { SessionList } from "@/components/account/session-list";
import { PageHeader } from "@/components/common/page-header";
import { UserAvatar } from "@/components/common/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const [account, sessions, activity] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { createdAt: true, lastLoginAt: true, passwordChangedAt: true, applicationAccess: { include: { application: { select: { name: true, brandColor: true } } } } },
    }),
    prisma.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    prisma.activityLog.findMany({ where: { actorId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, summary: true, createdAt: true } }),
  ]);

  return (
    <>
      <PageHeader title="Your profile" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center gap-4">
              <UserAvatar name={user.name} className="size-14 text-lg" />
              <div className="space-y-1">
                <CardTitle className="text-lg">{user.name}</CardTitle>
                <CardDescription>
                  {user.email}
                  {user.jobTitle ? ` · ${user.jobTitle}` : ""}
                </CardDescription>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge>{ROLE_LABELS[user.role]}</Badge>
                  <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[user.role]}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProfileForm name={user.name} jobTitle={user.jobTitle} email={user.email} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Password</CardTitle>
              <CardDescription>
                {account.passwordChangedAt ? `Last changed ${timeAgo(account.passwordChangedAt)}.` : "Choose a strong, unique password."} Changing it signs out your other sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active sessions</CardTitle>
              <CardDescription>Devices currently signed in to your account.</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionList
                sessions={sessions.map((s) => ({
                  id: s.id,
                  current: s.id === user.sessionId,
                  userAgent: s.userAgent,
                  ipAddress: s.ipAddress,
                  lastSeenAt: s.lastSeenAt.toISOString(),
                  createdAt: s.createdAt.toISOString(),
                }))}
              />
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Member since</dt>
                  <dd>{formatDateTime(account.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Last sign-in</dt>
                  <dd>{account.lastLoginAt ? formatDateTime(account.lastLoginAt) : "—"}</dd>
                </div>
                <div className="space-y-1 pt-2">
                  <dt className="text-muted-foreground">Application access</dt>
                  <dd className="flex flex-wrap gap-1">
                    {user.restrictApplications ? (
                      account.applicationAccess.map((a) => (
                        <span key={a.applicationId} className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: a.application.brandColor }} />
                          {a.application.name}
                        </span>
                      ))
                    ) : (
                      <span>All applications</span>
                    )}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Your recent activity</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <p>{a.summary}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
