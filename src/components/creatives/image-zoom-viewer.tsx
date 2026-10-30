"use client";

import { Expand, Maximize, Minus, Plus, Scan } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const MIN = 0.1;
const MAX = 16;

/**
 * High-quality image viewer: wheel/pinch-free zoom with buttons and the mouse
 * wheel, drag to pan, fit-to-screen, 1:1 actual pixels and fullscreen.
 */
export function ImageZoomViewer({ src, alt, naturalWidth }: { src: string; alt: string; naturalWidth?: number | null }) {
  const container = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fit = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setScale((prev) => {
      const next = Math.min(MAX, Math.max(MIN, prev * factor));
      if (container.current && clientX !== undefined && clientY !== undefined) {
        const rect = container.current.getBoundingClientRect();
        const cx = clientX - rect.left - rect.width / 2;
        const cy = clientY - rect.top - rect.height / 2;
        setOffset((o) => ({ x: cx - ((cx - o.x) * next) / prev, y: cy - ((cy - o.y) * next) / prev }));
      }
      return next;
    });
  }, []);

  const actualSize = () => {
    const el = img.current;
    if (!el) return;
    const natural = naturalWidth || el.naturalWidth;
    const rendered = el.getBoundingClientRect().width / scale;
    if (natural && rendered) {
      setScale(natural / rendered);
      setOffset({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  return (
    <div className="relative">
      <div
        ref={container}
        className="checkerboard relative flex h-[min(70vh,720px)] select-none items-center justify-center overflow-hidden rounded-xl border"
        style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
        onDoubleClick={(e) => (scale > 1 ? fit() : zoomAt(2.5, e.clientX, e.clientY))}
        onPointerDown={(e) => {
          if (scale <= 1) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={img}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="max-h-full max-w-full object-contain transition-opacity"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 120ms ease-out",
            opacity: loaded ? 1 : 0,
            imageRendering: scale > 3 ? "pixelated" : "auto",
          }}
        />
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg border bg-background/90 p-1 shadow-sm backdrop-blur">
        <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1 / 1.4)} aria-label="Zoom out">
          <Minus />
        </Button>
        <span className="tabular w-12 text-center text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon-sm" onClick={() => zoomAt(1.4)} aria-label="Zoom in">
          <Plus />
        </Button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="Fit to screen">
          <Scan />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={actualSize} aria-label="Actual size (100%)">
          <Expand />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => container.current?.requestFullscreen?.()} aria-label="Fullscreen">
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
