import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { CreativeBrowser } from "@/components/library/creative-browser";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Declined Creatives" };

export default async function DeclinedPage({ searchParams }: PageProps<"/declined">) {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Declined Creatives" description="Creatives that were declined during validation. Correct them and resubmit." />
      <CreativeBrowser
        user={user}
        basePath="/declined"
        searchParams={await searchParams}
        fixed={{ status: "DECLINED" }}
        emptyTitle="No declined creatives"
        emptyDescription="Nothing has been declined. Declined creatives can be corrected and resubmitted."
      />
    </>
  );
}
