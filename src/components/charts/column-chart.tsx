"use client";

import { format, parseISO } from "date-fns";
import { useState } from "react";
import { formatNumber } from "@/lib/format";

/**
 * Single-series daily column chart (one hue; the card title names the series,
 * so no legend). Columns are capped at 24px with a 4px rounded cap and grow
 * from a hairline baseline; each day has a full-height hover/focus target with
 * a tooltip, and the data is available as a table for screen readers.
 */
export function ColumnChart({ data, unit = "creatives" }: { data: { date: string; count: number }[]; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count));
  const top = niceMax(max);
  const total = data.reduce((s, d) => s + d.count, 0);
  const shown = active !== null ? data[active] : null;

  return (
    <figure className="space-y-2">
      <div className="flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="tabular">
          {shown ? (
            <>
              <span className="font-medium text-foreground">{format(parseISO(shown.date), "EEE d MMM")}</span> · {formatNumber(shown.count)} {unit}
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{formatNumber(total)}</span> {unit} in the last {data.length} days
            </>
          )}
        </span>
      </div>
      <div className="relative h-40" onMouseLeave={() => setActive(null)}>
        <div className="tabular pointer-events-none absolute -top-1 left-0 text-[10px] text-muted-foreground">{formatNumber(top)}</div>
        <div className="pointer-events-none absolute inset-x-0 top-1.5 h-px bg-border/60" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 top-1.5 flex items-end gap-[2px] border-b border-border">
          {data.map((d, i) => {
            const h = top ? (d.count / top) * 100 : 0;
            return (
              <button
                key={d.date}
                type="button"
                className="group relative flex h-full flex-1 items-end justify-center outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${format(parseISO(d.date), "d MMMM")}: ${d.count} ${unit}`}
              >
                <span className="absolute inset-0 rounded-sm bg-foreground/[0.04] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                {d.count > 0 && (
                  <span
                    className="relative w-full max-w-6 rounded-t-[4px] bg-primary transition-[height] duration-500"
                    style={{ height: `max(${h}%, 3px)`, opacity: active === null || active === i ? 1 : 0.55 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{format(parseISO(data[0].date), "d MMM")}</span>
        <span>{format(parseISO(data[Math.floor(data.length / 2)].date), "d MMM")}</span>
        <span>{format(parseISO(data[data.length - 1].date), "d MMM")}</span>
      </div>
      <table className="sr-only">
        <caption>Creatives uploaded per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function niceMax(value: number) {
  if (value <= 4) return Math.max(1, value);
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) if (value <= s * magnitude) return s * magnitude;
  return 10 * magnitude;
}
