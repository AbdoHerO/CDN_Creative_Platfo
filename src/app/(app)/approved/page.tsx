import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { CreativeBrowser } from "@/components/library/creative-browser";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Approved Creatives" };

export default async function ApprovedPage({ searchParams }: PageProps<"/approved">) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Approved Creatives" description="Creatives validated and ready to use. Always pick the latest approved version from here." />
      <CreativeBrowser
        user={user}
        basePath="/approved"
        searchParams={await searchParams}
        fixed={{ status: "APPROVED" }}
        emptyTitle="No approved creatives yet"
        emptyDescription="Creatives appear here once a reviewer approves them."
      />
    </>
  );
}
