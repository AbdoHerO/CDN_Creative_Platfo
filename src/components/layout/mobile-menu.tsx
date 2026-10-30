"use client";

import { Download, LogOut, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { UserAvatar } from "@/components/common/user-avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { RoleKey } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/constants";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { OPEN_INSTALL_EVENT, useInstallAvailable } from "./install-prompt";
import { visibleNav } from "./nav-config";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
] as const;

/** Phone menu: a bottom sheet with every section as a large tile, the profile, theme and sign out. */
export function MobileMenu({
  open,
  onOpenChange,
  user,
  permissions,
  queueCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { name: string; email: string; role: RoleKey };
  permissions: Permission[];
  queueCount: number;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const close = () => onOpenChange(false);
  const canInstall = useInstallAvailable();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-3xl border-0 p-0 pb-[env(safe-area-inset-bottom)] md:hidden"
        data-testid="mobile-menu"
      >
        <div className="sticky top-0 z-10 bg-popover/95 px-5 pb-3 pt-2 backdrop-blur">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <Link href="/profile" onClick={close} className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3 active:scale-[0.99]">
            <UserAvatar name={user.name} className="size-11 text-sm" />
            <span className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{user.name}</SheetTitle>
              <SheetDescription className="truncate text-xs">
                {ROLE_LABELS[user.role]} · {user.email}
              </SheetDescription>
            </span>
          </Link>
        </div>

        <nav className="space-y-5 px-5 pb-4 pt-2" aria-label="All sections">
          {visibleNav(user.role, permissions).map((group) => (
            <section key={group.label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
              <div className="grid grid-cols-3 gap-2">
                {group.items.map((item) => {
                  const on = active(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "relative flex aspect-[5/4] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center text-[11px] font-medium leading-tight transition-colors active:scale-95",
                        on ? "border-primary/40 bg-primary/10 text-foreground" : "bg-card text-muted-foreground",
                      )}
                    >
                      <item.icon className={cn("size-[22px]", on ? "text-primary" : "text-foreground/80")} />
                      <span className="line-clamp-2">{item.title}</span>
                      {item.badge === "queue" && queueCount > 0 && (
                        <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                          {queueCount > 99 ? "99+" : queueCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Appearance</p>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/70 p-1">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTheme(t.value)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium",
                    (theme ?? "system") === t.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <t.icon className="size-4" /> {t.label}
                </button>
              ))}
            </div>
          </section>

          {canInstall && (
            <button
              type="button"
              onClick={() => {
                close();
                // Let the sheet close before the install dialog takes the focus.
                setTimeout(() => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT)), 300);
              }}
              className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 p-3 text-left text-white shadow-lg shadow-primary/25 active:scale-[0.99]"
              data-testid="menu-install"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" className="size-10 rounded-xl ring-2 ring-white/30" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Install the app</span>
                <span className="block text-xs text-white/80">Add Creative Hub to your home screen</span>
              </span>
              <Download className="size-5 shrink-0" />
            </button>
          )}

          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-2xl border bg-card py-3 text-sm font-medium text-destructive active:scale-[0.99]">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
