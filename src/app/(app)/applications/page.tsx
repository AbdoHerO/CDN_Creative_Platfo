import { AppWindow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ApplicationFormDialog } from "@/components/applications/application-form-dialog";
import { AppLogo } from "@/components/common/app-badge";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/current-user";
import { formatBytes, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { listApplications } from "@/server/queries/applications";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const user = await requireUser();
  const apps = await listApplications(user);
  const isAdmin = can(user.role, "application.manage");
  return (
    <>
      <PageHeader
        title="Applications"
        description="Every creative belongs to one application. Administrators can add applications at any time."
        actions={isAdmin && <ApplicationFormDialog />}
      />
      {apps.length === 0 ? (
        <EmptyState icon={AppWindow} title="No applications" description="Create the first application to start organising creatives." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {apps.map((a) => (
            <li key={a.id}>
              <Link
                href={`/applications/${a.id}`}
                className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-px hover:border-foreground/15 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <AppLogo name={a.name} color={a.brandColor} logoUrl={a.logoUrl} className="size-11" />
                  {a.status === "DISABLED" && <Badge variant="secondary">Disabled</Badge>}
                </div>
                <div className="mt-4 flex-1 space-y-1">
                  <p className="font-semibold tracking-tight group-hover:text-primary">{a.name}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{a.description ?? "No description."}</p>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Creatives</dt>
                    <dd className="tabular font-medium">{formatNumber(a.creatives)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Campaigns</dt>
                    <dd className="tabular font-medium">{formatNumber(a.campaigns)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Storage</dt>
                    <dd className="tabular font-medium">{formatBytes(a.storageBytes)}</dd>
                  </div>
                </dl>
                <span className="mt-4 h-1 w-full rounded-full" style={{ backgroundColor: a.brandColor }} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
