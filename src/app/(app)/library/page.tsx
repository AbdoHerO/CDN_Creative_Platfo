import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { CreativeBrowser } from "@/components/library/creative-browser";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Creative Library" };

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="Creative Library"
        description={
          user.role === "VIEWER"
            ? "Every approved creative across all applications."
            : "Browse, search and filter every creative across all applications."
        }
        actions={
          can(user.role, "creative.upload") && (
            <Button asChild>
              <Link href="/upload">
                <Upload /> Upload creatives
              </Link>
            </Button>
          )
        }
      />
      <CreativeBrowser user={user} basePath="/library" searchParams={await searchParams} />
    </>
  );
}
