"use client";

import { Download, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const ALL = "__all";

export function ActivityFilters({
  users,
  actions,
  entities,
  applications,
}: {
  users: { id: string; name: string }[];
  actions: { value: string; label: string }[];
  entities: { value: string; label: string }[];
  applications: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const last = useRef(q);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const s = next.toString();
    startTransition(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  };

  useEffect(() => {
    if (q === last.current) return;
    const t = setTimeout(() => {
      last.current = q;
      update({ q: q.trim() || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <Select value={sp.get(key) ?? ALL} onValueChange={(v) => update({ [key]: v })}>
      <SelectTrigger size="sm" className="h-9 min-w-[150px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All · {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity, user or creative…" className="h-9 pl-8" aria-label="Search activity" />
      </div>
      {select("user", "Users", users.map((u) => ({ value: u.id, label: u.name })))}
      {select("action", "Actions", actions)}
      {select("entity", "Entities", entities)}
      {select("app", "Applications", applications.map((a) => ({ value: a.id, label: a.name })))}
      <Input type="date" className="h-9 w-[150px]" value={sp.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} aria-label="From date" />
      <Input type="date" className="h-9 w-[150px]" value={sp.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} aria-label="To date" />
      {pending && <Spinner />}
      <Button asChild variant="outline" size="sm" className="h-9">
        <a href={`/api/activity/export?${sp.toString()}`}>
          <Download /> Export CSV
        </a>
      </Button>
    </div>
  );
}
