/**
 * ZIP entry safety checks (pure functions, unit tested).
 *
 * Defends against path traversal ("zip slip"), absolute paths, symbolic links,
 * encrypted entries, and decompression bombs. Entries are never written to disk
 * using their archive path — extracted bytes go straight to object storage under
 * generated keys — but paths are still validated so the review UI and folder
 * based suggestions only ever see clean relative paths.
 */

export type PathCheck = { ok: true; path: string; segments: string[] } | { ok: false; reason: string };

const MAX_PATH_LENGTH = 1024;
const MAX_DEPTH = 32;

export function normalizeEntryPath(raw: string): PathCheck {
  if (!raw) return { ok: false, reason: "Empty file name." };
  if (raw.includes("\0")) return { ok: false, reason: "File name contains a null byte." };
  const unified = raw.replace(/\\/g, "/");
  if (unified.startsWith("/") || /^[a-zA-Z]:/.test(unified) || unified.startsWith("//")) {
    return { ok: false, reason: "Absolute paths are not allowed." };
  }
  const segments = unified.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) return { ok: false, reason: "Path traversal (“..”) is not allowed." };
  if (segments.length === 0) return { ok: false, reason: "Empty path." };
  if (segments.length > MAX_DEPTH) return { ok: false, reason: "Folder structure is too deep." };
  const path = segments.join("/");
  if (path.length > MAX_PATH_LENGTH) return { ok: false, reason: "Path is too long." };
  // Control characters are never legitimate in creative file names.
  if (/[\x00-\x1f\x7f]/.test(path)) return { ok: false, reason: "File name contains control characters." };
  return { ok: true, path, segments };
}

/** OS metadata that should be ignored silently. */
export function isJunkEntry(path: string): boolean {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? "";
  if (segments.some((s) => s === "__MACOSX" || s === ".git" || s === ".svn")) return true;
  if (/^(\.ds_store|thumbs\.db|desktop\.ini|icon\r)$/i.test(name)) return true;
  if (name.startsWith("._") || name.startsWith("~$")) return true;
  return segments.some((s) => s.startsWith("."));
}

/** Unix symlink bit in the external attributes of entries created on Unix. */
export function isSymlinkEntry(externalFileAttributes: number, versionMadeBy: number): boolean {
  const madeByUnix = versionMadeBy >> 8 === 3;
  if (!madeByUnix) return false;
  const mode = (externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

export function isEncryptedEntry(generalPurposeBitFlag: number): boolean {
  return (generalPurposeBitFlag & 0x1) !== 0;
}

/** Highly compressible payloads above 1 MiB are treated as potential zip bombs. */
export function isSuspiciousRatio(uncompressed: number, compressed: number, maxRatio: number): boolean {
  if (uncompressed <= 1024 * 1024) return false;
  if (compressed <= 0) return true;
  return uncompressed / compressed > maxRatio;
}

/** Entry names are UTF-8 when flag bit 11 is set; otherwise try UTF-8 then Latin-1. */
export function decodeEntryName(raw: Buffer, generalPurposeBitFlag: number): string {
  if ((generalPurposeBitFlag & 0x800) !== 0) return raw.toString("utf8");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    return raw.toString("latin1");
  }
}
