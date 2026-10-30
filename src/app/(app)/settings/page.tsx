import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BadgeManager } from "@/components/badges/badge-manager";
import { PageHeader } from "@/components/common/page-header";
import { PlatformSettingsForm } from "@/components/settings/platform-settings-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { getEnv, getStorageConfig } from "@/lib/env";
import { formatNumber, timeAgo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { getWorkerHealth } from "@/server/queries/system";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const isAdmin = can(user.role, "settings.manage");
  const canManageBadges = can(user.role, "badge.manage");
  const badges = canManageBadges
    ? await prisma.badge.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, color: true, _count: { select: { creatives: true } } },
      })
    : [];
  const env = getEnv();
  const storage = getStorageConfig();
  const [settings, health] = isAdmin ? await Promise.all([getSettings(), getWorkerHealth()]) : [null, null];
  const { queued, failed24h, lastCompletedAt, stalled: workerStalled } = health ?? { queued: 0, failed24h: 0, lastCompletedAt: null, stalled: false };

  return (
    <>
      <PageHeader title="Settings" description={isAdmin ? "Personal preferences and platform-wide configuration." : "Your personal preferences."} />
      <div className="grid max-w-5xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
            <CardDescription>These settings apply to your account only.</CardDescription>
          </CardHeader>
          <CardContent>
            <PreferencesForm showPreviewVersions={user.showPreviewVersions} libraryView={user.libraryView} />
          </CardContent>
        </Card>

        {canManageBadges && (
          <Card id="badges">
            <CardHeader>
              <CardTitle className="text-base">Badges</CardTitle>
              <CardDescription>
                Labels shown on creatives, such as Motion graphique, Higgsfield or 3D. Switch them on from a creative page; imports add a badge
                automatically when its name is part of the file name.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BadgeManager badges={badges.map((b) => ({ id: b.id, name: b.name, color: b.color, count: b._count.creatives }))} />
            </CardContent>
          </Card>
        )}

        {isAdmin && settings && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform</CardTitle>
                <CardDescription>Applies to everyone. Changes are recorded in the activity history.</CardDescription>
              </CardHeader>
              <CardContent>
                <PlatformSettingsForm settings={settings} serverMaxUploadMb={env.UPLOAD_MAX_FILE_SIZE_MB} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">System status</CardTitle>
                <CardDescription>Integrations configured through environment variables (secrets are never displayed).</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <Status ok={!!storage} label="RustFS (S3) storage" detail={storage ? `Bucket ${storage.bucket} · ${new URL(storage.endpoint).host}` : "Set URL_RUSTFS, BUCKET_NAME, ACCESS_KEY, SECRET_KEY"} />
                  <Status
                    ok={!workerStalled && failed24h === 0}
                    label="Background worker"
                    detail={`${formatNumber(queued)} queued/running · ${formatNumber(failed24h)} failed in 24 h · last job ${lastCompletedAt ? timeAgo(lastCompletedAt) : "never"}${workerStalled ? " · queue is not being processed — is `npm run worker` running?" : ""}`}
                  />
                  <Status ok label="Upload limits" detail={`Multipart above ${env.UPLOAD_MULTIPART_THRESHOLD_MB} MB in ${env.UPLOAD_PART_SIZE_MB} MB parts · hard limit ${formatNumber(env.UPLOAD_MAX_FILE_SIZE_MB)} MB`} />
                  <Status ok label="ZIP import limits" detail={`${formatNumber(env.ZIP_MAX_ENTRIES)} entries · ${formatNumber(env.ZIP_MAX_UNCOMPRESSED_MB)} MB expanded · ratio ≤ ${env.ZIP_MAX_COMPRESSION_RATIO}:1`} />
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/applications">Manage applications</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/team">Manage users</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/storage">Storage</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
      <div>
        <dt className="font-medium">{label}</dt>
        <dd className="text-xs text-muted-foreground">{detail}</dd>
      </div>
    </div>
  );
}
