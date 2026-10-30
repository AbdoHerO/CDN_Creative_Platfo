import { Clock, Eye, FilePen, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { CreativeBrowser } from "@/components/library/creative-browser";
import type { CreativeStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db";
import { timeAgo } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { creativeVisibilityWhere } from "@/lib/visibility";

export const metadata: Metadata = { title: "Pending Validation" };

const TABS = [
  { status: "PENDING", label: "Pending", icon: Inbox, tone: "text-amber-600" },
  { status: "IN_REVIEW", label: "In review", icon: Eye, tone: "text-sky-600" },
  { status: "DRAFT", label: "Drafts", icon: FilePen, tone: "text-muted-foreground" },
] as const satisfies readonly { status: CreativeStatus; label: string; icon: unknown; tone: string }[];

/**
 * Validation queue with the library's look: tabs for submitted, in-review and
 * not-yet-submitted creatives, the same filters and cards, and the workflow
 * buttons (submit, approve, decline…) under each creative.
 */
export default async function ValidationPage({ searchParams }: PageProps<"/validation">) {
  const user = await requireUser();
  if (user.role === "VIEWER") redirect("/approved");
  const sp = await searchParams;
  const reviewer = can(user.role, "creative.review");
  // Creators see their own creatives here; reviewers see everything they can access.
  const scope = { AND: [creativeVisibilityWhere(user), reviewer ? {} : { createdById: user.id }] };
  const [byStatus, oldest] = await Promise.all([
    prisma.creative.groupBy({ by: ["status"], where: { AND: [scope, { status: { in: ["PENDING", "IN_REVIEW", "DRAFT"] } }] }, _count: { _all: true } }),
    prisma.creative.findFirst({ where: { AND: [scope, { status: { in: ["PENDING", "IN_REVIEW"] } }] }, orderBy: { submittedAt: "asc" }, select: { submittedAt: true } }),
  ]);
  const count = (s: CreativeStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const requested = TABS.find((t) => t.status === sp.tab)?.status;
  // Nothing submitted yet: open on the drafts so the page is never needlessly empty.
  const tab: CreativeStatus = requested ?? (count("PENDING") === 0 && count("IN_REVIEW") === 0 && count("DRAFT") > 0 ? "DRAFT" : "PENDING");

  return (
    <>
      <PageHeader
        title="Pending Validation"
        className="mb-4 sm:mb-6"
        description={
          <span className="hidden sm:inline">
            {reviewer
              ? "Submitted creatives waiting for a decision, and drafts not submitted yet. Approving makes the current full version the approved one."
              : "Your creatives waiting for validation, and your drafts."}
            {oldest?.submittedAt && ` Oldest waiting: ${timeAgo(oldest.submittedAt)}.`}
          </span>
        }
      />

      <nav className="mb-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" aria-label="Queue">
        {TABS.map((t) => {
          const active = t.status === tab;
          return (
            <Link
              key={t.status}
              href={`/validation?tab=${t.status}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-start gap-1 rounded-2xl border bg-card p-3 transition-all sm:min-w-44 sm:flex-row sm:items-center sm:gap-3 sm:px-4",
                active ? "border-primary/40 shadow-sm ring-2 ring-primary/20" : "hover:border-foreground/20",
              )}
              data-testid={`queue-tab-${t.status}`}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:order-2 sm:text-sm">
                <t.icon className={cn("size-4", t.tone)} /> {t.label}
                {t.status === "DRAFT" && <span className="hidden lg:inline">(not submitted)</span>}
              </span>
              <span className="text-2xl font-semibold tabular-nums sm:order-1">{count(t.status)}</span>
            </Link>
          );
        })}
        {oldest?.submittedAt && (
          <span className="col-span-3 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
            <Clock className="size-3.5" /> Oldest waiting {timeAgo(oldest.submittedAt)}
          </span>
        )}
      </nav>

      <CreativeBrowser
        user={user}
        basePath="/validation"
        searchParams={sp}
        fixed={{ status: tab, uploader: reviewer ? undefined : user.id }}
        extraParams={{ tab }}
        workflow
        emptyTitle={tab === "DRAFT" ? "No drafts" : tab === "PENDING" ? "Nothing waiting for validation" : "Nothing in review"}
        emptyDescription={
          tab === "DRAFT"
            ? "Every creative has been submitted."
            : "Submit drafts from the Drafts tab (one by one, or several at once with Edit badges → Submit in the library)."
        }
      />
    </>
  );
}
