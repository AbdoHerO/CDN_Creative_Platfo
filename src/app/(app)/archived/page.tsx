import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { CreativeBrowser } from "@/components/library/creative-browser";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Archived Creatives" };

export default async function ArchivedPage({ searchParams }: PageProps<"/archived">) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Archived Creatives" description="Retired creatives kept for reference. Archived items are hidden from the main library." />
      <CreativeBrowser
        user={user}
        basePath="/archived"
        searchParams={await searchParams}
        fixed={{ status: "ARCHIVED" }}
        emptyTitle="No archived creatives"
        emptyDescription="Archived creatives are kept here for reference and can be restored."
      />
    </>
  );
}
