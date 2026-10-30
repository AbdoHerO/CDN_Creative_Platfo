import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fileTypeForName, sniffMatches } from "@/lib/files/types";
import { decodeEntryName, isEncryptedEntry, isJunkEntry, isSuspiciousRatio, isSymlinkEntry, normalizeEntryPath } from "@/lib/zip/safety";

describe("ZIP entry safety", () => {
  it("rejects path traversal and absolute paths", () => {
    expect(normalizeEntryPath("../../etc/passwd").ok).toBe(false);
    expect(normalizeEntryPath("folder/../../x.png").ok).toBe(false);
    expect(normalizeEntryPath("/etc/passwd").ok).toBe(false);
    expect(normalizeEntryPath("C:\\Windows\\x.png").ok).toBe(false);
    expect(normalizeEntryPath("\\\\server\\share\\x.png").ok).toBe(false);
    expect(normalizeEntryPath("a\0b.png").ok).toBe(false);
  });

  it("normalises safe relative paths", () => {
    expect(normalizeEntryPath("WinMed\\Summer\\./teaser.mp4")).toEqual({ ok: true, path: "WinMed/Summer/teaser.mp4", segments: ["WinMed", "Summer", "teaser.mp4"] });
  });

  it("flags OS junk files", () => {
    expect(isJunkEntry("__MACOSX/x/._a.png")).toBe(true);
    expect(isJunkEntry("folder/.DS_Store")).toBe(true);
    expect(isJunkEntry("Thumbs.db")).toBe(true);
    expect(isJunkEntry(".hidden/a.png")).toBe(true);
    expect(isJunkEntry("folder/banner.png")).toBe(false);
  });

  it("detects symlinks created on Unix", () => {
    expect(isSymlinkEntry((0o120777 << 16) >>> 0, 3 << 8)).toBe(true);
    expect(isSymlinkEntry((0o100644 << 16) >>> 0, 3 << 8)).toBe(false);
    expect(isSymlinkEntry((0o120777 << 16) >>> 0, 0)).toBe(false);
  });

  it("detects encrypted entries", () => {
    expect(isEncryptedEntry(0x1)).toBe(true);
    expect(isEncryptedEntry(0x800)).toBe(false);
  });

  it("flags decompression bombs by ratio", () => {
    expect(isSuspiciousRatio(60 * 1024 * 1024, 60_000, 200)).toBe(true);
    expect(isSuspiciousRatio(39_000_000, 38_800_000, 200)).toBe(false);
    expect(isSuspiciousRatio(500_000, 10, 200)).toBe(false); // tiny files are fine
  });

  it("decodes UTF-8 and legacy entry names", () => {
    expect(decodeEntryName(Buffer.from("été.png", "utf8"), 0x800)).toBe("été.png");
    expect(decodeEntryName(Buffer.from("été.png", "utf8"), 0)).toBe("été.png");
    expect(decodeEntryName(Buffer.from([0x63, 0xe9, 0x2e, 0x70, 0x6e, 0x67]), 0)).toBe("cé.png");
  });
});

describe("content sniffing", () => {
  it("accepts real PNG bytes for a .png and rejects them for a .mp4", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const detected = await fileTypeFromBuffer(png);
    expect(sniffMatches(fileTypeForName("a.png")!, detected?.mime, png)).toBe(true);
    expect(sniffMatches(fileTypeForName("a.mp4")!, detected?.mime, png)).toBe(false);
  });

  it("accepts SVG markup and rejects other text", () => {
    const svg = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(sniffMatches(fileTypeForName("logo.svg")!, undefined, svg)).toBe(true);
    expect(sniffMatches(fileTypeForName("logo.svg")!, undefined, new TextEncoder().encode("<html><script>alert(1)</script>"))).toBe(false);
  });

  it("rejects unknown extensions", () => {
    expect(fileTypeForName("tool.exe")).toBeNull();
    expect(fileTypeForName("notes.txt")).toBeNull();
    expect(fileTypeForName("CLIP.MP4")?.mediaType).toBe("VIDEO");
  });
});
