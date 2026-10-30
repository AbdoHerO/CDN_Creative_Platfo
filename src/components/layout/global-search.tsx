"use client";

import { AppWindow, FileVideo, FolderKanban, ImageIcon, Search, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/creatives/status-badge";
import type { CreativeStatus, MediaType } from "@/generated/prisma/enums";

type SearchResults = {
  creatives: { id: string; name: string; status: CreativeStatus; mediaType: MediaType; application: string; thumbnailUrl: string | null }[];
  campaigns: { id: string; name: string; application: string }[];
  applications: { id: string; name: string; brandColor: string }[];
};

const EMPTY: SearchResults = { creatives: [], campaigns: [], applications: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !isTyping(e.target))) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      controller.current?.abort();
      return;
    }
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) setResults((await res.json()) as SearchResults);
      } catch {
        /* aborted or offline */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const q = query.trim();
  const shown = q.length >= 2 ? results : EMPTY;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-sm items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="truncate">Search creatives, campaigns…</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
        title="Search"
        description="Search creatives, campaigns and applications"
      >
        <Command shouldFilter={false}>
        <CommandInput placeholder="Search by name, filename, tag, campaign…" value={query} onValueChange={setQuery} />
        <CommandList>
          {q.length >= 2 && !loading && (
            <CommandEmpty>No matches. Press Enter to search the full library.</CommandEmpty>
          )}
          {q.length >= 1 && (
            <CommandGroup heading="Library">
              <CommandItem value={`search:${q}`} onSelect={() => go(`/library?q=${encodeURIComponent(q)}`)}>
                {loading ? <Spinner /> : <Search />}
                Search the library for “{q}”
              </CommandItem>
            </CommandGroup>
          )}
          {shown.creatives.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Creatives">
                {shown.creatives.map((c) => (
                  <CommandItem key={c.id} value={`creative:${c.id}`} onSelect={() => go(`/creatives/${c.id}`)}>
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                      {c.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.thumbnailUrl} alt="" className="size-full object-cover" />
                      ) : c.mediaType === "VIDEO" ? (
                        <FileVideo className="size-4" />
                      ) : c.mediaType === "IMAGE" ? (
                        <ImageIcon className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.application}</span>
                    </span>
                    <StatusBadge status={c.status} className="ml-auto" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {shown.campaigns.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Campaigns">
                {shown.campaigns.map((c) => (
                  <CommandItem key={c.id} value={`campaign:${c.id}`} onSelect={() => go(`/campaigns/${c.id}`)}>
                    <FolderKanban />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{c.application}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {shown.applications.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Applications">
                {shown.applications.map((a) => (
                  <CommandItem key={a.id} value={`app:${a.id}`} onSelect={() => go(`/applications/${a.id}`)}>
                    <AppWindow />
                    <span className="size-2 rounded-full" style={{ backgroundColor: a.brandColor }} />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.tagName === "SELECT");
}
