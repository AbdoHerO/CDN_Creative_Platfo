import Link from "next/link";
import { formatNumber } from "@/lib/format";

/**
 * Horizontal bars for comparing magnitude: one hue, bars grow from a single
 * baseline with a 4px rounded data end, value at the tip in text ink. Identity
 * comes from the label column (and any swatch it contains), never bar color.
 */
export function HorizontalBars({
  rows,
  label,
  emptyText = "No data yet.",
  formatValue = formatNumber,
}: {
  rows: { key: string; label: React.ReactNode; value: number; href?: string }[];
  label: string;
  emptyText?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length === 0) return <p className="py-6 text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <figure>
      <ul className="space-y-2.5" aria-label={label}>
        {rows.map((r) => {
          const pct = (r.value / max) * 100;
          const share = total ? Math.round((r.value / total) * 100) : 0;
          const content = (
            <>
              <span className="min-w-0 truncate text-sm">{r.label}</span>
              <span className="relative flex h-6 items-center" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                {r.value > 0 && (
                  <span
                    className="relative h-3 rounded-r-[4px] bg-primary transition-[width] duration-500"
                    style={{ width: `max(${pct}%, 3px)` }}
                  />
                )}
              </span>
              <span className="tabular min-w-20 text-right text-sm whitespace-nowrap">
                {formatValue(r.value)}
                <span className="ml-1 text-xs text-muted-foreground">{share}%</span>
              </span>
            </>
          );
          return (
            <li key={r.key} title={`${formatValue(r.value)} (${share}%)`}>
              {r.href ? (
                <Link
                  href={r.href}
                  className="-mx-2 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-2 transition-colors hover:bg-muted/50"
                >
                  {content}
                </Link>
              ) : (
                <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_auto] items-center gap-3">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
      <figcaption className="sr-only">
        {label}: {rows.map((r) => `${typeof r.label === "string" ? r.label : r.key} ${r.value}`).join(", ")}
      </figcaption>
    </figure>
  );
}
