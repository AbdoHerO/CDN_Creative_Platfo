import { format, formatDistanceToNowStrict } from "date-fns";

/** Client-safe formatting helpers. */

export function formatBytes(input: number | bigint | null | undefined, decimals = 1): string {
  const bytes = Number(input ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : decimals)} ${units[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(date: Date | string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!date) return "—";
  return format(new Date(date), pattern);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, "d MMM yyyy, HH:mm");
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return `${formatDistanceToNowStrict(new Date(date))} ago`;
}

export function formatNumber(value: number | bigint): string {
  return new Intl.NumberFormat("en-US").format(Number(value));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function formatResolution(width?: number | null, height?: number | null): string | null {
  return width && height ? `${width} × ${height}` : null;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** Two-letter initials of a brand: "Win+Pharma" → "WP", "WinMed" → "WM", "iCoral" → "IC", "Pharmalien" → "PH". */
export function brandInitials(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+|(?=[A-Z])/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? name).slice(0, 2);
  return letters.toUpperCase();
}
