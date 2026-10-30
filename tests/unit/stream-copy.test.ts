import { describe, expect, it } from "vitest";
import { wantsStreamCopy } from "@/lib/files/stream-copy";

describe("streaming copy rule", () => {
  const video = (extension: string, mbps: number | null) => ({ mediaType: "VIDEO" as const, extension, bitrate: mbps === null ? null : mbps * 1_000_000 });

  it("covers heavy videos, above the bitrate threshold", () => {
    expect(wantsStreamCopy(video("mp4", 23.9), 4)).toBe(true);
    expect(wantsStreamCopy(video("mov", 9.8), 4)).toBe(true);
    expect(wantsStreamCopy(video("mp4", 3.5), 4)).toBe(false);
    expect(wantsStreamCopy(video("mp4", 0.5), 4)).toBe(false);
    expect(wantsStreamCopy(video("mp4", null), 4)).toBe(false);
  });

  it("always covers formats browsers cannot play", () => {
    expect(wantsStreamCopy(video("mkv", 1), 4)).toBe(true);
    expect(wantsStreamCopy(video("avi", null), 4)).toBe(true);
  });

  it("never covers other media types", () => {
    expect(wantsStreamCopy({ mediaType: "IMAGE", extension: "png", bitrate: null }, 4)).toBe(false);
    expect(wantsStreamCopy({ mediaType: "DOCUMENT", extension: "pdf", bitrate: null }, 4)).toBe(false);
  });
});
