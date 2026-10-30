import { describe, expect, it } from "vitest";
import { contentDisposition, nextFreeName, normalizeMatchKey, parseFilename, safeObjectName } from "@/lib/files/naming";

describe("parseFilename", () => {
  it("classifies files ending in _preview as PREVIEW and strips the suffix for matching", () => {
    const full = parseFilename("summer_campaign.mp4");
    const preview = parseFilename("summer_campaign_preview.mp4");
    expect(full.detectedVersionType).toBe("FULL");
    expect(preview.detectedVersionType).toBe("PREVIEW");
    expect(preview.isPreview).toBe(true);
    expect(preview.baseStem).toBe("summer_campaign");
    expect(full.matchKey).toBe(preview.matchKey);
    expect(full.matchKey).toBe("summer_campaign");
  });

  it("is case-insensitive for the suffix and the extension", () => {
    const p = parseFilename("Summer_Campaign_PREVIEW.MOV");
    expect(p.isPreview).toBe(true);
    expect(p.extension).toBe("mov");
    expect(p.matchKey).toBe("summer_campaign");
  });

  it("matches full and preview even when the containers differ", () => {
    expect(parseFilename("promo.mov").matchKey).toBe(parseFilename("promo_preview.mp4").matchKey);
  });

  it("recognises -preview and a preview word in the middle of the name", () => {
    const hyphen = parseFilename("icoral-anim01-3d-conseil-preview.mp4");
    expect(hyphen.isPreview).toBe(true);
    expect(hyphen.matchKey).toBe(parseFilename("icoral-anim01-3d-conseil.mp4").matchKey);
    const middle = parseFilename("winmed_promo_preview_v2.mp4");
    expect(middle.isPreview).toBe(true);
    expect(middle.matchKey).toBe("winmed_promo_v2");
  });

  it("only treats preview as a separate word after the first one", () => {
    expect(parseFilename("preview.mp4").isPreview).toBe(false);
    expect(parseFilename("_preview.mp4").isPreview).toBe(false);
    expect(parseFilename("preview_of_launch.mp4").isPreview).toBe(false);
    expect(parseFilename("spot_previews.mp4").isPreview).toBe(false);
    expect(parseFilename("spotpreview.mp4").isPreview).toBe(false);
  });

  it("strips directories from archive paths", () => {
    expect(parseFilename("WinMed/Summer/teaser_preview.mp4").filename).toBe("teaser_preview.mp4");
    expect(parseFilename("a\\b\\c.png").filename).toBe("c.png");
  });

  it("produces a human readable default name", () => {
    expect(parseFilename("summer_campaign_preview.mp4").displayName).toBe("Summer campaign");
    expect(parseFilename("WinMed_Spring-Promo_v2.png").displayName).toBe("WinMed Spring Promo v2");
    expect(parseFilename("icoral-anim01-3d-conseil-preview.mp4").displayName).toBe("Icoral anim01 3d conseil");
  });

  it("handles files without extension", () => {
    const p = parseFilename("README");
    expect(p.extension).toBe("");
    expect(p.stem).toBe("README");
  });
});

describe("nextFreeName", () => {
  it("adds (2), (3)… to names already in use, ignoring case", () => {
    expect(nextFreeName("Spot", new Set())).toBe("Spot");
    expect(nextFreeName("Spot", new Set(["spot"]))).toBe("Spot (2)");
    expect(nextFreeName("Spot", new Set(["spot", "spot (2)"]))).toBe("Spot (3)");
  });
});

describe("normalizeMatchKey", () => {
  it("normalises case, accents and separators", () => {
    expect(normalizeMatchKey("Été  Campagne--2026")).toBe("ete_campagne_2026");
    expect(normalizeMatchKey("Summer Campaign")).toBe(normalizeMatchKey("summer_campaign"));
    expect(normalizeMatchKey("___")).toBe("untitled");
  });
});

describe("safeObjectName", () => {
  it("keeps the extension and removes unsafe characters", () => {
    expect(safeObjectName("Promo vidéo (final) #2.MP4")).toBe("Promo-video-final-2.mp4");
    expect(safeObjectName("../../etc/passwd")).toBe("passwd");
  });
});

describe("contentDisposition", () => {
  it("preserves the original UTF-8 filename with an ASCII fallback", () => {
    const header = contentDisposition("attachment", "Campagne été.mp4");
    // NFKD splits "é" into "e" + a combining accent, which the ASCII fallback replaces.
    expect(header).toContain('filename="Campagne e_te_.mp4"');
    expect(header).toContain("filename*=UTF-8''Campagne%20%C3%A9t%C3%A9.mp4");
    expect(header.startsWith("attachment;")).toBe(true);
  });

  it("escapes quotes in the fallback", () => {
    expect(contentDisposition("inline", 'a"b.png')).toContain('filename="a_b.png"');
  });
});
