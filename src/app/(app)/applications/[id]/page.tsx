import { CheckCircle2, Clock, FolderKanban, HardDrive, Layers, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApplicationAdminControls } from "@/components/applications/application-admin-controls";
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog";
import { AppLogo } from "@/components/common/app-badge";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { CreativeBrowser } from "@/components/library/creative-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/current-user";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { formatBytes, formatDate } from "@/lib/format";
import { can, hasApplicationAccess } from "@/lib/permissions";
import { trySignedGetUrl } from "@/lib/storage/r2";
import { creativeVisibilityWhere } from "@/lib/visibility";
import { storageByApplication } from "@/server/queries/applications";

export async function generateMetadata({ params }: PageProps<"/applications/[id]">): Promise<Metadata> {
  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id }, select: { name: true } });
  return { title: app?.name ?? "Application" };
}

export default async function ApplicationPage({ params, searchParams }: PageProps<"/applications/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app || !hasApplicationAccess(user, app.id)) notFound();

  const base = { AND: [creativeVisibilityWhere(user), { applicationId: id }, { files: { some: {} } }] };
  const [total, approved, pending, campaigns, storage, logoUrl] = await Promise.all([
    prisma.creative.count({ where: base }),
    prisma.creative.count({ where: { AND: [base, { status: "APPROVED" }] } }),
    prisma.creative.count({ where: { AND: [base, { status: { in: ["PENDING", "IN_REVIEW"] } }] } }),
    prisma.campaign.findMany({
      where: { applicationId: id },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: { _count: { select: { creatives: true } } },
    }),
    storageByApplication(),
    trySignedGetUrl(app.logoKey, { stable: true }),
  ]);
  const isAdmin = can(user.role, "application.manage");

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Applications", href: "/applications" }, { label: app.name }]}
        title={
          <span className="flex items-center gap-3">
            <AppLogo name={app.name} color={app.brandColor} logoUrl={logoUrl} className="size-9" />
            {app.name}
            {app.status === "DISABLED" && <Badge variant="secondary">Disabled</Badge>}
          </span>
        }
        description={app.description ?? undefined}
        actions={
          <>
            {can(user.role, "creative.upload") && app.status === "ACTIVE" && (
              <Button asChild>
                <Link href={`/upload?app=${app.id}`}>
                  <Upload /> Upload
                </Link>
              </Button>
            )}
            {isAdmin && <ApplicationFormDialog application={app} />}
            {isAdmin && <ApplicationAdminControls id={app.id} name={app.name} status={app.status} hasLogo={!!app.logoKey} />}
          </>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Creatives" value={total} icon={Layers} />
        <StatCard label="Approved" value={approved} icon={CheckCircle2} tone="emerald" href={`/approved?app=${app.id}`} />
        <StatCard label="Awaiting validation" value={pending} icon={Clock} tone="amber" href={`/validation?app=${app.id}`} />
        <StatCard label="Campaigns" value={campaigns.length} icon={FolderKanban} tone="sky" href={`/campaigns?app=${app.id}`} />
        <StatCard label="Storage" value={formatBytes(storage.get(app.id) ?? 0)} icon={HardDrive} tone="zinc" />
      </div>

      {campaigns.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Campaigns</h2>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {campaigns.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link href={`/campaigns/${c.id}`} className="block w-60 rounded-lg border bg-card p-3 transition-colors hover:border-foreground/20">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {CAMPAIGN_STATUS_LABELS[c.status]} · {c._count.creatives} creatives
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.startDate ? formatDate(c.startDate) : "No start"} – {c.endDate ? formatDate(c.endDate) : "open"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mb-3 text-sm font-semibold">Creatives</h2>
      <CreativeBrowser
        user={user}
        basePath={`/applications/${app.id}`}
        searchParams={await searchParams}
        fixed={{ app: app.id }}
        emptyTitle={`No creatives for ${app.name} yet`}
      />
    </>
  );
}
