"use client";

import {
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileWarning,
  Loader2,
  Maximize,
  Minimize,
  PanelLeft,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Pdfjs = typeof import("pdfjs-dist");
type Size = { w: number; h: number };
type Zoom = "width" | "page" | number;

/** Runtime assets copied to public/pdfjs by scripts/copy-pdfjs.mjs (served from our own origin). */
const ASSETS = "/pdfjs/";
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const PAGE_GAP = 20;
const PADDING = 48;

let pdfjsPromise: Promise<Pdfjs> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = `${ASSETS}pdf.worker.min.mjs`;
    return m;
  });
  return pdfjsPromise;
}

/** Render a page into a fresh canvas (swapped in when done, so zooming never flashes white). */
async function renderPage(page: PDFPageProxy, scale: number, rotation: number, onTask: (t: RenderTask) => void) {
  const viewport = page.getViewport({ scale, rotation });
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  canvas.className = "absolute inset-0";
  const task = page.render({ canvas, viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined });
  onTask(task);
  await task.promise;
  return { canvas, viewport };
}

/** Scroll `container` (only) so that `el` sits at its top — never scrolls the browser window. */
function scrollWithin(container: HTMLElement | null, el: Element | null | undefined, offset = 16) {
  if (container && el instanceof HTMLElement) container.scrollTo({ top: Math.max(0, el.offsetTop - offset) });
}

function useVisible(ref: React.RefObject<HTMLElement | null>, root: HTMLElement | null, margin: string) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root, rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, root, margin]);
  return visible;
}

/**
 * PDF reader built on pdf.js: page thumbnails, continuous scrolling with lazy
 * page rendering, selectable text, zoom (fit width / fit page / steps,
 * Ctrl + wheel), rotation, full screen and keyboard shortcuts (← → PageUp
 * PageDown Home End to move, + − 0 to zoom, F full screen).
 */
export function PdfReader({ src, title, downloadHref, openHref }: { src: string; title: string; downloadHref: string; openHref: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [thumbRoot, setThumbRoot] = useState<HTMLDivElement | null>(null);
  const [pdfjs, setPdfjs] = useState<Pdfjs | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("width");
  const [rotation, setRotation] = useState(0);
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [sidebar, setSidebar] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoomMenu, setZoomMenu] = useState(false);
  const [box, setBox] = useState<Size>({ w: 800, h: 600 });

  // Load the document (the viewer mounts one reader per file, keyed by file id).
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;
    loadPdfjs()
      .then(async (lib) => {
        const task = lib.getDocument({
          url: src,
          cMapUrl: `${ASSETS}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${ASSETS}standard_fonts/`,
          wasmUrl: `${ASSETS}wasm/`,
          iccUrl: `${ASSETS}iccs/`,
        });
        destroy = () => void task.destroy();
        task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => total && setProgress(Math.min(1, loaded / total));
        const loaded = await task.promise;
        const pages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, i) =>
            loaded.getPage(i + 1).then((p) => {
              const v = p.getViewport({ scale: 1 });
              return { w: v.width, h: v.height };
            }),
          ),
        );
        if (cancelled) return;
        setPdfjs(lib);
        setDoc(loaded);
        setSizes(pages);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The document could not be opened.");
      });
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [src]);

  // Track the reading area size for fit-to-width / fit-to-page.
  useEffect(() => {
    if (!scroller) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const first = sizes[0] ?? { w: 595, h: 842 };
  const base = rotation % 180 ? { w: first.h, h: first.w } : first;
  const fitWidth = Math.max(0.1, (box.w - PADDING) / base.w);
  const fitPage = Math.max(0.1, Math.min((box.w - PADDING) / base.w, (box.h - PADDING) / base.h));
  const scale = Math.min(5, Math.max(0.25, zoom === "width" ? Math.min(fitWidth, 2.5) : zoom === "page" ? fitPage : zoom));

  const goTo = useCallback(
    (n: number) => {
      const page = Math.max(1, Math.min(sizes.length || 1, n));
      scrollWithin(scroller, scroller?.querySelector(`[data-page="${page}"]`));
      setCurrent(page);
      setPageInput(String(page));
    },
    [sizes.length, scroller],
  );

  // Keep the current page in view when the zoom or rotation changes.
  const keep = useRef(1);
  useEffect(() => {
    keep.current = current;
  }, [current]);
  useLayoutEffect(() => {
    if (sizes.length) scrollWithin(scroller, scroller?.querySelector(`[data-page="${keep.current}"]`));
  }, [scale, rotation, sizes.length, scroller]);

  const onScroll = () => {
    if (!scroller) return;
    const probe = scroller.scrollTop + scroller.clientHeight / 3;
    let page = 1;
    for (const el of scroller.querySelectorAll<HTMLElement>("[data-page]")) {
      const n = Number(el.dataset.page);
      if (el.offsetTop <= probe && n > page) page = n;
    }
    if (page !== current) {
      setCurrent(page);
      setPageInput(String(page));
    }
  };

  const zoomBy = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOM_STEPS.find((z) => z > scale + 0.01) : [...ZOOM_STEPS].reverse().find((z) => z < scale - 0.01);
    setZoom(next ?? (dir > 0 ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : ZOOM_STEPS[0]));
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.current?.requestFullscreen();
  };

  // Ctrl/⌘ + wheel zooms instead of scrolling the page.
  useEffect(() => {
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => {
        const now = z === "width" ? Math.min(fitWidth, 2.5) : z === "page" ? fitPage : z;
        return Math.min(5, Math.max(0.25, +(now * (e.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(3)));
      });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [scroller, fitWidth, fitPage]);

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => goTo(current - 1),
      ArrowRight: () => goTo(current + 1),
      PageUp: () => goTo(current - 1),
      PageDown: () => goTo(current + 1),
      Home: () => goTo(1),
      End: () => goTo(sizes.length),
      "+": () => zoomBy(1),
      "=": () => zoomBy(1),
      "-": () => zoomBy(-1),
      "0": () => setZoom("width"),
      f: toggleFullscreen,
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  const zoomLabel = zoom === "width" ? "Fit width" : zoom === "page" ? "Fit page" : `${Math.round(scale * 100)}%`;

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onKey}
      className={cn(
        "relative flex flex-col overflow-hidden bg-neutral-900 text-white shadow-lg ring-1 ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-primary",
        fullscreen ? "h-screen" : "h-[min(82vh,940px)] rounded-2xl",
      )}
      data-testid="pdf-reader"
      aria-label={`PDF reader: ${title}`}
    >
      {/* Toolbar */}
      <div className="relative z-20 flex h-12 shrink-0 items-center gap-1 border-b border-white/10 bg-neutral-950/90 px-2 backdrop-blur sm:gap-2 sm:px-3">
        <ToolButton label={sidebar ? "Hide pages" : "Show pages"} onClick={() => setSidebar((s) => !s)} active={sidebar} className="hidden md:flex">
          <PanelLeft />
        </ToolButton>
        <div className="mx-1 hidden h-5 w-px bg-white/10 md:block" />
        <ToolButton label="Previous page" onClick={() => goTo(current - 1)} disabled={current <= 1}>
          <ChevronUp />
        </ToolButton>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            goTo(Number(pageInput) || current);
          }}
          className="flex items-center gap-1.5 text-sm tabular-nums text-white/70"
        >
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => setPageInput(String(current))}
            className="h-7 w-10 rounded-md bg-white/10 text-center text-sm font-medium text-white outline-none ring-1 ring-white/10 focus:ring-primary"
            aria-label="Page number"
            data-testid="pdf-page-input"
          />
          <span>/ {sizes.length || "–"}</span>
        </form>
        <ToolButton label="Next page" onClick={() => goTo(current + 1)} disabled={!sizes.length || current >= sizes.length}>
          <ChevronDown />
        </ToolButton>

        <div className="flex-1" />

        <ToolButton label="Zoom out (−)" onClick={() => zoomBy(-1)}>
          <ZoomOut />
        </ToolButton>
        <div className="relative">
          <button
            type="button"
            onClick={() => setZoomMenu((o) => !o)}
            className="h-8 min-w-22 rounded-lg px-2.5 text-xs font-semibold text-white/90 tabular-nums ring-1 ring-white/10 transition-colors hover:bg-white/10"
            aria-label="Zoom"
            aria-expanded={zoomMenu}
            data-testid="pdf-zoom"
          >
            {zoomLabel}
          </button>
          {zoomMenu && (
            <div className="absolute right-1/2 top-10 z-20 w-36 translate-x-1/2 overflow-hidden rounded-xl bg-neutral-900/95 p-1 shadow-2xl ring-1 ring-white/15 backdrop-blur" role="menu">
              {(["width", "page", ...ZOOM_STEPS] as Zoom[]).map((z) => (
                <button
                  key={String(z)}
                  type="button"
                  role="menuitemradio"
                  aria-checked={zoom === z}
                  onClick={() => {
                    setZoom(z);
                    setZoomMenu(false);
                  }}
                  className={cn("flex w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-white/85 hover:bg-white/10", zoom === z && "bg-white/15 font-semibold text-white")}
                >
                  {z === "width" ? "Fit width" : z === "page" ? "Fit page" : `${Math.round(z * 100)}%`}
                </button>
              ))}
            </div>
          )}
        </div>
        <ToolButton label="Zoom in (+)" onClick={() => zoomBy(1)}>
          <ZoomIn />
        </ToolButton>
        <ToolButton label="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw />
        </ToolButton>

        <div className="flex-1" />

        <ToolButton label="Open in a new tab" href={openHref} className="hidden sm:flex">
          <ExternalLink />
        </ToolButton>
        <ToolButton label="Download" href={downloadHref}>
          <Download />
        </ToolButton>
        <ToolButton label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize /> : <Maximize />}
        </ToolButton>
      </div>

      <div className="flex min-h-0 flex-1" onClick={() => zoomMenu && setZoomMenu(false)}>
        {/* Page thumbnails */}
        {sidebar && doc && (
          <div ref={setThumbRoot} className="relative hidden w-40 shrink-0 space-y-4 overflow-y-auto border-r border-white/10 bg-neutral-950/60 p-4 md:block" aria-label="Pages">
            {sizes.map((size, i) => (
              <Thumbnail key={i} doc={doc} number={i + 1} size={size} rotation={rotation} root={thumbRoot} active={current === i + 1} onClick={() => goTo(i + 1)} />
            ))}
          </div>
        )}

        {/* Pages */}
        <div
          ref={setScroller}
          onScroll={onScroll}
          className="relative min-w-0 flex-1 overflow-auto bg-neutral-800 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.05)_1px,transparent_0)] bg-size-[22px_22px]"
        >
          {doc && pdfjs ? (
            <div className="flex min-w-fit flex-col items-center px-6 py-6" style={{ gap: PAGE_GAP }}>
              {sizes.map((size, i) => (
                <Page
                  key={i}
                  pdfjs={pdfjs}
                  doc={doc}
                  number={i + 1}
                  size={size}
                  scale={scale}
                  rotation={rotation}
                  root={scroller}
                />
              ))}
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <FileWarning className="size-10 text-white/40" strokeWidth={1.5} />
              <p className="max-w-sm text-sm text-white/70">This PDF could not be displayed ({error}).</p>
              <a href={downloadHref} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white/90">
                Download the original
              </a>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <Loader2 className="size-8 animate-spin text-white/60" />
              <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-linear-to-r from-primary to-fuchsia-400 transition-[width]" style={{ width: `${Math.max(8, progress * 100)}%` }} />
              </div>
              <p className="text-xs text-white/50">Opening document…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Page({
  pdfjs,
  doc,
  number,
  size,
  scale,
  rotation,
  root,
}: {
  pdfjs: Pdfjs;
  doc: PDFDocumentProxy;
  number: number;
  size: Size;
  scale: number;
  rotation: number;
  root: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const visible = useVisible(ref, root, "900px 0px");
  const dims = rotation % 180 ? { w: size.h, h: size.w } : size;
  const width = Math.floor(dims.w * scale);
  const height = Math.floor(dims.h * scale);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let textLayer: InstanceType<Pdfjs["TextLayer"]> | null = null;
    (async () => {
      const page = await doc.getPage(number);
      const { canvas, viewport } = await renderPage(page, scale, rotation, (t) => (task = t));
      if (cancelled) return;
      host.current?.replaceChildren(canvas);
      setRendered(true);
      // Selectable text (only upright pages; the reader's own layout handles rotation).
      if (text.current) {
        text.current.replaceChildren();
        if (rotation === 0) {
          textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text.current, viewport });
          await textLayer.render();
        }
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      (task as RenderTask | null)?.cancel();
      textLayer?.cancel();
    };
  }, [visible, doc, number, scale, rotation, pdfjs]);

  return (
    <div
      ref={ref}
      className="relative shrink-0 overflow-hidden rounded-[3px] bg-white shadow-[0_10px_40px_-10px_rgb(0_0_0/0.6)] ring-1 ring-black/20"
      style={
        {
          width,
          height,
          "--scale-factor": scale,
          "--user-unit": 1,
          "--total-scale-factor": "calc(var(--scale-factor) * var(--user-unit))",
          "--scale-round-x": "1px",
          "--scale-round-y": "1px",
        } as React.CSSProperties
      }
      data-page={number}
      aria-label={`Page ${number}`}
    >
      <div ref={host} />
      <div ref={text} className="textLayer" />
      {!rendered && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-br from-neutral-100 to-neutral-200">
          <span className="text-sm font-medium text-neutral-400">{number}</span>
        </div>
      )}
    </div>
  );
}

const THUMB_WIDTH = 104;

function Thumbnail({
  doc,
  number,
  size,
  rotation,
  root,
  active,
  onClick,
}: {
  doc: PDFDocumentProxy;
  number: number;
  size: Size;
  rotation: number;
  root: HTMLElement | null;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const visible = useVisible(ref, root, "400px 0px");
  const dims = rotation % 180 ? { w: size.h, h: size.w } : size;
  const scale = THUMB_WIDTH / dims.w;

  useEffect(() => {
    const el = ref.current;
    if (!active || !el || !root) return;
    if (el.offsetTop < root.scrollTop || el.offsetTop + el.offsetHeight > root.scrollTop + root.clientHeight) {
      root.scrollTo({ top: Math.max(0, el.offsetTop - root.clientHeight / 3) });
    }
  }, [active, root]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    doc
      .getPage(number)
      .then((page) => renderPage(page, scale, rotation, (t) => (task = t)))
      .then(({ canvas }) => !cancelled && host.current?.replaceChildren(canvas))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      (task as RenderTask | null)?.cancel();
    };
  }, [visible, doc, number, scale, rotation]);

  return (
    <button ref={ref} type="button" onClick={onClick} className="group block w-full text-center" aria-label={`Go to page ${number}`} aria-current={active}>
      <div
        className={cn(
          "relative mx-auto overflow-hidden rounded bg-white shadow-md ring-2 transition-all",
          active ? "ring-primary" : "ring-transparent group-hover:ring-white/40",
        )}
        style={{ width: THUMB_WIDTH, height: Math.floor(dims.h * scale) }}
      >
        <div ref={host} />
      </div>
      <span className={cn("mt-1.5 block text-[11px] tabular-nums", active ? "font-semibold text-white" : "text-white/50")}>{number}</span>
    </button>
  );
}

function ToolButton({
  label,
  onClick,
  href,
  disabled,
  active,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const classes = cn(
    "flex size-8 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[18px]",
    active && "bg-white/10 text-white",
    className,
  );
  if (href) {
    return (
      <a href={href} title={label} aria-label={label} className={classes} target={href.includes("/preview") ? "_blank" : undefined} rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
