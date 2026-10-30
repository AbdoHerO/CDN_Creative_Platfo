import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadTabs } from "@/components/upload/upload-tabs";
import { requirePagePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { isStorageConfigured, MB } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { applicationScope, campaignScope } from "@/lib/visibility";

export const metadata: Metadata = { title: "Upload" };

export default async function UploadPage({ searchParams }: PageProps<"/upload">) {
  const user = await requirePagePermission("creative.upload");
  const params = await searchParams;
  const [applications, campaigns, tags, settings] = await Promise.all([
    prisma.application.findMany({
      where: { AND: [applicationScope(user), { status: "ACTIVE" }] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, brandColor: true },
    }),
    prisma.campaign.findMany({
      where: { AND: [campaignScope(user), { status: { not: "ARCHIVED" } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, applicationId: true },
    }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, take: 500 }),
    getSettings(),
  ]);
  const storageReady = isStorageConfigured();
  const initialApp = typeof params.app === "string" && applications.some((a) => a.id === params.app) ? params.app : (applications[0]?.id ?? "");
  const initialCampaign =
    typeof params.campaign === "string" && campaigns.some((c) => c.id === params.campaign && c.applicationId === initialApp) ? params.campaign : "";

  return (
    <>
      <PageHeader
        title="Upload creatives"
        description="Originals are uploaded directly to secure storage and kept byte-for-byte — never compressed, resized or re-encoded. Thumbnails and previews are generated separately."
      />
      {!storageReady && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle />
          <AlertTitle>File storage is not configured</AlertTitle>
          <AlertDescription>
            Uploads are disabled until the RustFS storage settings are set (URL_RUSTFS, BUCKET_NAME, ACCESS_KEY, SECRET_KEY). See
            the deployment guide in the README.
          </AlertDescription>
        </Alert>
      )}
      {applications.length === 0 ? (
        <Alert>
          <AlertTitle>No active application available</AlertTitle>
          <AlertDescription>Ask an administrator to create an application or grant you access to one.</AlertDescription>
        </Alert>
      ) : (
        <UploadTabs
          disabled={!storageReady}
          applications={applications}
          campaigns={campaigns}
          tagSuggestions={tags.map((t) => t.name)}
          maxFileSizeBytes={settings.maxUploadSizeMb * MB}
          initialApplicationId={initialApp}
          initialCampaignId={initialCampaign}
          initialTab={params.tab === "zip" ? "zip" : "files"}
        />
      )}
    </>
  );
}
