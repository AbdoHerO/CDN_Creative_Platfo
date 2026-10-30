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
        className="mb-4 sm:mb-6"
        description={
          <span className="hidden sm:inline">
            {user.role === "VIEWER" ? "Every approved creative across all applications." : "Browse, search and filter every creative across all applications."}
          </span>
        }
        actions={
          can(user.role, "creative.upload") && (
            // Phones upload from the bottom bar.
            <Button asChild className="hidden md:inline-flex">
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
