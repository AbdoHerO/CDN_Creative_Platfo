import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { MediaType } from "@/generated/prisma/enums";
import { getEnv } from "@/lib/env";
import { fileTypeForName } from "@/lib/files/types";

/**
 * Metadata extraction and derived-asset generation. Originals are only ever
 * read; thumbnails and display renditions are new, separate files.
 */

const run = promisify(execFile);
const TOOL_TIMEOUT_MS = 5 * 60 * 1000;

sharp.cache(false);

const THUMB_MAX = 640;
const DISPLAY_MAX = 2560;
const SHARP_INPUT = { limitInputPixels: 1_000_000_000, failOn: "none" as const };

export type MediaResult = {
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  frameRate?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  bitrate?: number | null;
  pageCount?: number | null;
  thumbnail?: Buffer | null;
  display?: Buffer | null;
  metadata: Record<string, unknown>;
  warnings: string[];
};

async function tool(cmd: string, args: string[], timeout = TOOL_TIMEOUT_MS) {
  return run(cmd, args, { timeout, maxBuffer: 32 * 1024 * 1024, killSignal: "SIGKILL" });
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseRate(rate: unknown): number | null {
  if (typeof rate !== "string" || !rate.includes("/")) return toNumber(rate);
  const [a, b] = rate.split("/").map(Number);
  return a && b ? Math.round((a / b) * 1000) / 1000 : null;
}

async function makeThumbnail(input: string | Buffer): Promise<Buffer> {
  return sharp(input, SHARP_INPUT)
    .rotate()
    .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .webp({ quality: 80 })
    .toBuffer();
}

async function makeDisplay(input: string | Buffer): Promise<Buffer> {
  return sharp(input, SHARP_INPUT)
    .rotate()
    .resize(DISPLAY_MAX, DISPLAY_MAX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
}

type Probe = {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
    side_data_list?: { rotation?: number }[];
  }[];
  format?: { duration?: string; bit_rate?: string; format_name?: string; tags?: Record<string, string> };
};

export async function ffprobe(path: string): Promise<Probe> {
  const { stdout } = await tool(getEnv().FFPROBE_PATH, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
  return JSON.parse(stdout) as Probe;
}

async function extractVideo(path: string, tmp: string): Promise<MediaResult> {
  const warnings: string[] = [];
  const probe = await ffprobe(path);
  const video = probe.streams?.find((s) => s.codec_type === "video");
  const audio = probe.streams?.find((s) => s.codec_type === "audio");
  const duration = toNumber(probe.format?.duration);
  let width = video?.width ?? null;
  let height = video?.height ?? null;
  const rotation = Math.abs(toNumber(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate) ?? 0);
  if (width && height && rotation % 180 === 90) [width, height] = [height, width];

  let thumbnail: Buffer | null = null;
  if (video) {
    const out = join(tmp, "poster.jpg");
    const seek = duration && duration > 2 ? Math.min(1, duration * 0.1) : 0;
    for (const at of [seek, 0]) {
      try {
        await tool(getEnv().FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at), "-i", path, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", out]);
        thumbnail = await makeThumbnail(out);
        break;
      } catch (err) {
        if (at === 0) warnings.push(`Poster frame unavailable: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
      }
    }
  }
  return {
    width,
    height,
    durationSeconds: duration,
    frameRate: parseRate(video?.avg_frame_rate) ?? parseRate(video?.r_frame_rate),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    bitrate: toNumber(probe.format?.bit_rate),
    thumbnail,
    metadata: { container: probe.format?.format_name, rotation: rotation || undefined },
    warnings,
  };
}

async function extractAudio(path: string): Promise<MediaResult> {
  const probe = await ffprobe(path);
  const audio = probe.streams?.find((s) => s.codec_type === "audio");
  return {
    durationSeconds: toNumber(probe.format?.duration),
    audioCodec: audio?.codec_name ?? null,
    bitrate: toNumber(audio?.bit_rate ?? probe.format?.bit_rate),
    metadata: { container: probe.format?.format_name },
    warnings: [],
  };
}

async function extractImage(path: string, extension: string, tmp: string): Promise<MediaResult> {
  const warnings: string[] = [];
  const def = fileTypeForName(`x.${extension}`);
  let source: string = path;
  let meta: sharp.Metadata | null = null;
  try {
    meta = await sharp(path, SHARP_INPUT).metadata();
  } catch {
    // Formats sharp cannot decode (e.g. PSD) can often be decoded by ffmpeg.
    try {
      const png = join(tmp, "decoded.png");
      await tool(getEnv().FFMPEG_PATH, ["-hide_banner", "-loglevel", "error", "-y", "-i", path, "-frames:v", "1", png]);
      source = png;
      meta = await sharp(png, SHARP_INPUT).metadata();
    } catch (err) {
      warnings.push(`Preview unavailable for this format: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    }
  }
  if (!meta) return { metadata: {}, warnings };

  let width = meta.width ?? null;
  let height = meta.height ?? null;
  if (meta.orientation && meta.orientation >= 5 && width && height) [width, height] = [height, width];

  let thumbnail: Buffer | null = null;
  let display: Buffer | null = null;
  try {
    thumbnail = await makeThumbnail(source);
    if (!def?.browserPreviewable) display = await makeDisplay(source);
  } catch (err) {
    warnings.push(`Thumbnail generation failed: ${err instanceof Error ? err.message : err}`);
  }
  return {
    width,
    height,
    thumbnail,
    display,
    metadata: {
      format: meta.format,
      space: meta.space,
      channels: meta.channels,
      density: meta.density,
      hasAlpha: meta.hasAlpha,
      pages: meta.pages,
      colorProfile: meta.icc ? "embedded" : undefined,
    },
    warnings,
  };
}

async function extractDocument(path: string, extension: string, tmp: string): Promise<MediaResult> {
  const warnings: string[] = [];
  let pageCount: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  const env = getEnv();
  try {
    const { stdout } = await tool(env.PDFINFO_PATH, [path], 60_000);
    pageCount = toNumber(/Pages:\s+(\d+)/.exec(stdout)?.[1]);
    const size = /Page size:\s+([\d.]+) x ([\d.]+) pts/.exec(stdout);
    if (size) {
      width = Math.round(Number(size[1]));
      height = Math.round(Number(size[2]));
    }
  } catch (err) {
    warnings.push(`Document info unavailable: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  }
  let thumbnail: Buffer | null = null;
  let display: Buffer | null = null;
  try {
    const prefix = join(tmp, "page");
    await tool(env.PDFTOPPM_PATH, ["-f", "1", "-l", "1", "-png", "-scale-to", "2048", "-singlefile", path, prefix]);
    const png = await readFile(`${prefix}.png`);
    thumbnail = await makeThumbnail(png);
    if (extension !== "pdf") display = await makeDisplay(png);
  } catch (err) {
    warnings.push(`Page preview unavailable: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  }
  return { pageCount, width, height, thumbnail, display, metadata: { pageUnit: "pt" }, warnings };
}

export async function extractMedia(path: string, mediaType: MediaType, extension: string, tmp: string): Promise<MediaResult> {
  const size = (await stat(path)).size;
  let result: MediaResult;
  switch (mediaType) {
    case "VIDEO":
      result = await extractVideo(path, tmp);
      break;
    case "AUDIO":
      result = await extractAudio(path);
      break;
    case "IMAGE":
      result = await extractImage(path, extension, tmp);
      break;
    case "DOCUMENT":
      result = await extractDocument(path, extension, tmp);
      break;
    default:
      result = { metadata: {}, warnings: [] };
  }
  result.metadata = { ...result.metadata, bytesOnDisk: size };
  return result;
}
