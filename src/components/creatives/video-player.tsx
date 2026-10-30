"use client";

import { Gauge, Loader2, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Volume1, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HIDE_AFTER_MS = 2500;

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Video player with custom controls. Keyboard (when focused): Space/K play,
 * ←/→ 5 s, J/L 10 s, ↑/↓ volume, M mute, F full screen. Double-click toggles
 * full screen. Streams from the signed URL with HTTP range requests.
 */
export function VideoPlayer({
  src,
  type,
  poster,
  title,
  onError,
}: {
  src: string;
  type: string;
  poster?: string | null;
  title: string;
  onError: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controls, setControls] = useState(true);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);

  const v = () => video.current!;

  const reveal = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (video.current && !video.current.paused) setControls(false);
    }, HIDE_AFTER_MS);
  }, []);

  const toggle = useCallback(() => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  }, []);

  const seekBy = (delta: number) => {
    v().currentTime = Math.max(0, Math.min(v().duration || 0, v().currentTime + delta));
    reveal();
  };

  const setVol = (next: number) => {
    const value = Math.max(0, Math.min(1, next));
    v().volume = value;
    v().muted = value === 0;
  };

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrap.current?.requestFullscreen();
  }, []);

  const pip = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v().requestPictureInPicture();
    } catch {
      // Picture-in-picture is unavailable in this browser.
    }
  };

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrap.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const timeAt = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return { x: ratio * rect.width, t: ratio * (duration || 0) };
  };

  const onBarDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setScrubbing(true);
    v().currentTime = timeAt(e.clientX).t;
  };
  const onBarMove = (e: React.PointerEvent) => {
    const at = timeAt(e.clientX);
    setHover(at);
    if (scrubbing) v().currentTime = at.t;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const actions: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      arrowleft: () => seekBy(-5),
      arrowright: () => seekBy(5),
      j: () => seekBy(-10),
      l: () => seekBy(10),
      arrowup: () => setVol(v().volume + 0.1),
      arrowdown: () => setVol(v().volume - 0.1),
      m: () => (v().muted = !v().muted),
      f: toggleFullscreen,
    };
    const action = actions[key];
    if (action && !(e.target as HTMLElement).closest("[role=menu]")) {
      e.preventDefault();
      action();
      reveal();
    }
  };

  const progress = duration ? time / duration : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const showControls = controls || !playing || scrubbing || speedOpen;

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onKey}
      onMouseMove={reveal}
      onMouseLeave={() => playing && setControls(false)}
      className={cn(
        "group/player relative isolate overflow-hidden rounded-2xl bg-black shadow-lg ring-1 ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-primary",
        fullscreen ? "rounded-none" : "",
        !showControls && "cursor-none",
      )}
      data-testid="video-player"
      aria-label={`Video player: ${title}`}
    >
      <video
        ref={video}
        playsInline
        preload="metadata"
        poster={poster ?? undefined}
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          reveal();
        }}
        onPause={() => {
          setPlaying(false);
          setControls(true);
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBuffered(b.end(b.length - 1));
        }}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
        onError={onError}
        className={cn("mx-auto block w-full object-contain", fullscreen ? "h-screen" : "max-h-[min(72vh,760px)] min-h-[260px]")}
      >
        <source src={src} type={type} />
      </video>

      {/* Big play button */}
      {!playing && !waiting && (
        <button
          type="button"
          onClick={toggle}
          className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white shadow-2xl ring-1 ring-white/30 backdrop-blur-md transition-all hover:scale-105 hover:bg-white/25"
          aria-label={started ? "Resume" : "Play"}
          data-testid="player-big-play"
        >
          <Play className="ml-1 size-8 fill-current" />
        </button>
      )}
      {waiting && playing && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white backdrop-blur">
          <Loader2 className="size-7 animate-spin" />
        </span>
      )}

      {/* Title */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent px-5 pb-10 pt-4 text-sm font-medium text-white transition-opacity duration-300",
          showControls && started ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="line-clamp-1">{title}</span>
      </div>

      {/* Controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-3 pt-12 text-white transition-all duration-300 sm:px-4",
          showControls ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <div
          ref={bar}
          role="slider"
          tabIndex={-1}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={() => setScrubbing(false)}
          onPointerLeave={() => !scrubbing && setHover(null)}
          className="group/bar relative mb-2 flex h-4 cursor-pointer items-center"
        >
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-all group-hover/bar:h-1.5">
            <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${duration ? (buffered / duration) * 100 : 0}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-fuchsia-400" style={{ width: `${progress * 100}%` }} />
          </div>
          <span
            className="absolute size-3.5 -translate-x-1/2 rounded-full bg-white shadow-md ring-4 ring-white/20 transition-transform group-hover/bar:scale-100 sm:scale-0"
            style={{ left: `${progress * 100}%` }}
          />
          {hover && (
            <span
              className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
              style={{ left: hover.x }}
            >
              {clock(hover.t)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <ControlButton label={playing ? "Pause (k)" : "Play (k)"} onClick={toggle} testId="player-toggle">
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </ControlButton>
          <ControlButton label="Back 10 seconds (j)" onClick={() => seekBy(-10)}>
            <RotateCcw className="size-[18px]" />
          </ControlButton>
          <ControlButton label="Forward 10 seconds (l)" onClick={() => seekBy(10)}>
            <RotateCw className="size-[18px]" />
          </ControlButton>
          <div className="group/vol flex items-center">
            <ControlButton label={muted ? "Unmute (m)" : "Mute (m)"} onClick={() => (v().muted = !v().muted)}>
              <VolumeIcon className="size-5" />
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
              className="w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100"
            />
          </div>
          <span className="ml-1 text-xs font-medium tabular-nums text-white/90">
            {clock(time)} <span className="text-white/50">/ {clock(duration)}</span>
          </span>
          <div className="flex-1" />
          <div className="relative">
            <button
              type="button"
              onClick={() => setSpeedOpen((o) => !o)}
              className="flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/15"
              aria-label="Playback speed"
              aria-expanded={speedOpen}
            >
              <Gauge className="size-4" /> {speed}×
            </button>
            {speedOpen && (
              <div className="absolute bottom-10 right-0 z-10 w-28 overflow-hidden rounded-xl bg-black/80 p-1 shadow-xl ring-1 ring-white/15 backdrop-blur-md" role="menu">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitemradio"
                    aria-checked={s === speed}
                    onClick={() => {
                      v().playbackRate = s;
                      setSpeedOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-white/85 hover:bg-white/15",
                      s === speed && "bg-white/15 font-semibold text-white",
                    )}
                  >
                    {s === 1 ? "Normal" : `${s}×`}
                    {s === speed && <span className="size-1.5 rounded-full bg-white" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ControlButton label="Picture in picture" onClick={pip}>
            <PictureInPicture2 className="size-[18px]" />
          </ControlButton>
          <ControlButton label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFullscreen}>
            {fullscreen ? <Minimize className="size-[18px]" /> : <Maximize className="size-[18px]" />}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid={testId}
      className="flex size-9 items-center justify-center rounded-full text-white/90 transition-all hover:scale-105 hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  );
}
