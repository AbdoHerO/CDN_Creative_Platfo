"use client";

import { Download, EllipsisVertical, Maximize2, Share, SquarePlus, Store, Zap } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * "Install the app" prompt for phones and tablets: on Android (Chrome, Edge,
 * Samsung Internet) a one-tap install through the browser's own dialog, on
 * iPhone / iPad the Share → "Add to Home Screen" steps. Either way the app gets
 * an icon on the home screen and opens full screen.
 *
 * It is shown sparingly:
 * - only on touch devices, never inside the installed app;
 * - after some engagement (a second page, or 30 s on the site), never on a busy page;
 * - at most once per browser session;
 * - "Not now" hides it for 7 days, then 30 days; after the third time it is only
 *   shown on demand ("Install app" in the menu); "Don't ask again" and installing end it.
 */

/** Opens the prompt on demand (menu entry), whatever the snooze. */
export const OPEN_INSTALL_EVENT = "creative-hub:install";

const STORE_KEY = "creative-hub:install";
const SESSION_KEY = "creative-hub:install-shown";
const SNOOZE_DAYS = [7, 30];
const ENGAGED_MS = 30_000;
const SHOW_DELAY_MS = 2_500;
const BUSY_PATHS = ["/upload", "/imports", "/change-password"];

type Platform = "ios" | "android" | "other";
type Saved = { installed?: boolean; never?: boolean; dismissals?: number; snoozedUntil?: number };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// The browser fires beforeinstallprompt once per page load, possibly before
// React hydrates: capture it as soon as this module loads.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    save({ installed: true });
    notify();
  });
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

function save(patch: Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...load(), ...patch }));
  } catch {
    // Private mode or blocked storage: the prompt simply comes back next session.
  }
}

function shownThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // ignore
  }
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac: tell them apart by the touch screen.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isTouchDevice() {
  return window.matchMedia("(pointer: coarse) and (hover: none)").matches;
}

/** Social apps' built-in browsers cannot install web apps. */
function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Line\/|LinkedInApp|TikTok/i.test(navigator.userAgent);
}

function canAutoShow(pathname: string) {
  if (!isTouchDevice() || isStandalone() || isInAppBrowser()) return false;
  if (BUSY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  const s = load();
  if (s.installed || s.never || (s.dismissals ?? 0) > SNOOZE_DAYS.length) return false;
  if (s.snoozedUntil && Date.now() < s.snoozedUntil) return false;
  return !shownThisSession();
}

/** True on a phone or tablet browser where the app is not installed yet (for the menu entry). */
export function useInstallAvailable() {
  return useSyncExternalStore(
    subscribe,
    () => isTouchDevice() && !isStandalone() && !isInAppBrowser(),
    () => false,
  );
}

export function InstallPrompt() {
  const pathname = usePathname();
  const installEvent = useSyncExternalStore(subscribe, () => deferred, () => null);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("other");
  const [manual, setManual] = useState(false);
  const handled = useRef(false);
  const pages = useRef(new Set<string>());

  const show = (from: "auto" | "manual") => {
    setManual(from === "manual");
    handled.current = false;
    setPlatform(detectPlatform());
    setOpen(true);
  };

  // Automatic prompt, once the user has engaged with the app.
  useEffect(() => {
    pages.current.add(pathname);
    if (!canAutoShow(pathname)) return;
    const engagedIn = pages.current.size >= 2 ? 0 : ENGAGED_MS - performance.now();
    let timer = setTimeout(function attempt() {
      // Android only offers the install when the browser allows it (not when the app is already installed).
      if (!canAutoShow(pathname) || (detectPlatform() !== "ios" && !deferred)) return;
      // Never on top of another dialog (the reel feed, an edit form…): try again shortly.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        timer = setTimeout(attempt, 5_000);
        return;
      }
      markShown();
      show("auto");
    }, Math.max(SHOW_DELAY_MS, engagedIn));
    return () => clearTimeout(timer);
  }, [pathname]);

  // On demand, from the menu.
  useEffect(() => {
    const onOpen = () => show("manual");
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
  }, []);

  const finish = (patch: Saved) => {
    handled.current = true;
    save(patch);
    setOpen(false);
  };

  const notNow = () => {
    if (manual) return finish({});
    const dismissals = (load().dismissals ?? 0) + 1;
    const days = SNOOZE_DAYS[dismissals - 1];
    finish({ dismissals, snoozedUntil: days ? Date.now() + days * 86_400_000 : undefined });
  };

  const install = async () => {
    const event = deferred;
    if (!event) return;
    deferred = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      finish({ installed: true });
      toast.success("Creative Hub is being added to your home screen.");
    } else notNow();
  };

  const onOpenChange = (next: boolean) => {
    if (next) return setOpen(true);
    if (!handled.current) notNow();
    else setOpen(false);
  };

  const native = !!installEvent && platform !== "ios";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md" data-testid="install-prompt">
        <DialogHeader className="items-center text-center sm:items-center sm:text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="mb-1 size-16 rounded-2xl shadow-lg shadow-primary/30" />
          <DialogTitle className="text-lg">Install Creative Hub</DialogTitle>
          <DialogDescription>Add the app to your home screen and open it in one tap, like any other app.</DialogDescription>
        </DialogHeader>

        {/* The manual steps need the room on small screens. */}
        <ul className={cn("grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-muted-foreground", !native && "max-sm:hidden")}>
          {[
            { icon: Maximize2, label: "Full screen, no browser bars" },
            { icon: Zap, label: "Opens instantly" },
            { icon: Store, label: "No app store needed" },
          ].map((b) => (
            <li key={b.label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-muted/60 px-2 py-3">
              <b.icon className="size-5 text-primary" />
              {b.label}
            </li>
          ))}
        </ul>

        {!native && (
          <ol className="space-y-2 text-sm" data-testid={`install-steps-${platform}`}>
            {(platform === "ios"
              ? [
                  { icon: Share, text: <>Tap the <b>Share</b> button in the browser bar</> },
                  { icon: SquarePlus, text: <>Choose <b>Add to Home Screen</b> (scroll down if needed)</> },
                  { icon: Download, text: <>Tap <b>Add</b>: the icon appears on your home screen</> },
                ]
              : [
                  { icon: EllipsisVertical, text: <>Open the browser menu <b>⋮</b></> },
                  { icon: SquarePlus, text: <>Tap <b>Install app</b> or <b>Add to Home screen</b></> },
                  { icon: Download, text: <>Confirm: the icon appears on your home screen</> },
                ]
            ).map((step, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 leading-snug">{step.text}</span>
                <step.icon className="size-5 shrink-0 text-muted-foreground" />
              </li>
            ))}
          </ol>
        )}

        <DialogFooter>
          {!manual && (
            <Button variant="ghost" className="text-muted-foreground" onClick={() => finish({ never: true })}>
              Don&apos;t ask again
            </Button>
          )}
          <Button variant="outline" onClick={notNow}>
            Not now
          </Button>
          {native ? (
            <Button onClick={install} data-testid="install-app">
              <Download /> Install
            </Button>
          ) : (
            platform === "ios" && <Button onClick={() => finish({ installed: true })}>I&apos;ve added it</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
