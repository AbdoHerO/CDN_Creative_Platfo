"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/creatives/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CreativeStatus } from "@/generated/prisma/enums";

export type LookupCreative = { id: string; name: string; status: CreativeStatus; hasFull: boolean; fileCount?: number };

export function CreativeLookupDialog({
  open,
  onOpenChange,
  applicationId,
  excludeId,
  onSelect,
  title = "Attach to an existing creative",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  excludeId?: string;
  onSelect: (creative: LookupCreative) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupCreative[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !applicationId) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ applicationId, q });
        if (excludeId) params.set("exclude", excludeId);
        const res = await fetch(`/api/creatives/lookup?${params}`, { signal: ctrl.signal });
        const data = (await res.json()) as { creatives?: LookupCreative[] };
        setResults(data.creatives ?? []);
      } catch {
        /* aborted */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, applicationId, q, excludeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Only creatives of the same application that you are allowed to edit are listed.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or filename" className="pl-8" />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          {loading && results.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner /> Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matching creatives.</p>
          ) : (
            <ul className="divide-y">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.hasFull ? "Has a full version" : "Preview only"}
                        {typeof c.fileCount === "number" ? ` · ${c.fileCount} file${c.fileCount === 1 ? "" : "s"}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
