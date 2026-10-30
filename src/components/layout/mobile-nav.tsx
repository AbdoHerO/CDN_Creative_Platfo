"use client";

import { ClipboardCheck, Library, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { OPEN_SEARCH_EVENT } from "./global-search";

/**
 * App-style bottom bar on phones (hidden from md up): library, search, a
 * central upload button, the validation queue and the full menu.
 */
export function MobileNav({ canUpload, showQueue, queueCount }: { canUpload: boolean; showQueue: boolean; queueCount: number }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/75 md:hidden"
      aria-label="Main"
      data-testid="mobile-nav"
    >
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        <Item href="/library" label="Library" active={active("/library") || active("/creatives")}>
          <Library />
        </Item>
        <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} className={itemClass(false)} aria-label="Search">
          <Search />
          <span>Search</span>
        </button>
        {canUpload && (
          <Link
            href="/upload"
            aria-label="Upload"
            className="flex size-12 -translate-y-1 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-white shadow-lg shadow-primary/30 transition-transform active:scale-95"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </Link>
        )}
        {showQueue && (
          <Item href="/validation" label="Validation" active={active("/validation")} count={queueCount}>
            <ClipboardCheck />
          </Item>
        )}
        <button type="button" onClick={() => setOpenMobile(true)} className={itemClass(false)} aria-label="Menu">
          <Menu />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}

function itemClass(active: boolean) {
  return cn(
    "relative flex w-16 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition-colors [&_svg]:size-[22px]",
    active ? "text-foreground" : "text-muted-foreground active:text-foreground",
  );
}

function Item({ href, label, active, count, children }: { href: string; label: string; active: boolean; count?: number; children: React.ReactNode }) {
  return (
    <Link href={href} className={itemClass(active)} aria-current={active ? "page" : undefined}>
      {children}
      <span>{label}</span>
      {active && <span className="absolute -top-1 h-0.5 w-6 rounded-full bg-foreground" />}
      {!!count && (
        <span className="absolute right-3 top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
