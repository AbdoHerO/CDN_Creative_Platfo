import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

/** Server-rendered pagination that preserves all other query parameters. */
export function UrlPagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const windowPages = pageWindow(page, pages);

  return (
    <nav className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Pagination">
      <p className="tabular text-sm text-muted-foreground">
        {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button asChild={page > 1} variant="outline" size="sm" disabled={page <= 1}>
          {page > 1 ? (
            <Link href={href(page - 1)} aria-label="Previous page">
              <ChevronLeft /> Previous
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ChevronLeft /> Previous
            </span>
          )}
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {windowPages.map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button key={p} asChild variant={p === page ? "secondary" : "ghost"} size="sm" className="tabular min-w-8">
                <Link href={href(p)} aria-current={p === page ? "page" : undefined}>
                  {p}
                </Link>
              </Button>
            ),
          )}
        </div>
        <Button asChild={page < pages} variant="outline" size="sm" disabled={page >= pages}>
          {page < pages ? (
            <Link href={href(page + 1)} aria-label="Next page">
              Next <ChevronRight />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1">
              Next <ChevronRight />
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
}

function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push(null);
    out.push(sorted[i]);
  }
  return out;
}
