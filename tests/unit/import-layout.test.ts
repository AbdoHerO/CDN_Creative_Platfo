import { describe, expect, it } from "vitest";
import { platformFolder } from "@/lib/files/import-layout";
import { looseMatchKey, pairPreviewsLoosely, planAssociations, resolveAssociations } from "@/lib/files/matching";
import { parseFilename } from "@/lib/files/naming";
import { badgesForFilename } from "@/lib/badges";

/** The real `data_creatives` folder this platform is imported from. */
const TREE: Record<string, string[]> = {
  "cms-whatsapp-sender": [
    "01-WhatsApp-Sender-Pro-Architecture-Technique.pdf",
    "02-WhatsApp-Sender-Pro-Guide-Utilisateur-FR.pdf",
    "05-Storyboard-FR.pdf",
    "07-WhatsApp-Sender-Pro-Essentials-EN.pdf",
    "03-WhatsApp-Sender-Pro-Tutoriel-FR-16x9.mp4",
  ],
  icoral: [
    "icoral-anim01-3d-conseil-preview.mp4",
    "icoral-anim01-3d-conseil.mp4",
    "icoral-anim02-claymation-famille-preview.mp4",
    "icoral-anim02-claymation-famille.mp4",
    "icoral-anim03-minimal-prix-preview.mp4",
    "icoral-anim03-minimal-prix.mp4",
    "icoral-cartoon-video2-revised-final-preview.mp4",
    "icoral-cartoon-video2-revised-final.mp4",
    "icoral-commercial-reel-revised-final-preview.mp4",
    "icoral-commercial-reel-revised-final.mp4",
    ...Array.from({ length: 11 }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      const word = ["liberte", "quotidien", "route", "clarte", "devis", "entreprise", "conseil", "garanties", "famille", "marque", "voyage"][i];
      return [`icoral-s${n}-${word}-higgsfield-preview.mp4`, `icoral-s${n}-${word}-higgsfield.mp4`];
    }).flat(),
    "icoral_product_3d_reel.mp4",
    "icoral_product_3d_reel_preview.mp4",
  ],
  pharmalien: ["PharmaLien_Guide_Commande_Web_Desktop_16x9_v2.mp4", "PharmaLien_Guide_Commande_Web_Mobile_9x16_v2.mp4"],
  "win+pharma": [
    "ADS 1_meta_winpluspharma_ancien_clients.jpg",
    "migration_winpharm_cloud.jpg",
    "winplus_evolution_pharma.jpg",
    "13_monnayeur.mp4",
    "13_monnayeur_preview.mp4",
    "14_robot_v2.mp4",
    "14_robot_v2_preview.mp4",
    "15_lecteur_prix.mp4",
    "15_lecteur_prix_preview.mp4",
    ...["01_ocr_bl", "02_ai", "03_referential", "04_fse", "05_lots", "06_multi_depot", "07_sales", "08_purchases", "09_stock", "10_inventory", "11_statistics", "12_other"].flatMap(
      (s) => [`winpluspharm_${s}_preview.mp4`, `winpluspharm_${s}_reel.mp4`],
    ),
    "winpluspharm_instagram_reel.mp4",
    "winpluspharm_instagram_reel_preview.mp4",
    "winpluspharm_scenario_01.mp4",
    "winpluspharm_scenario_01_sans_intro.mp4",
    "winpluspharm_v01_ocr_bl.mp4",
    "winpluspharm_v02_assistant_ia.mp4",
    "winpluspharm_v04_fse_cnss.mp4",
    "winpluspharm_v06_multi_depot.mp4",
    "winpluspharm_v13_monnayeur.mp4",
    "winpluspharm_v14_robot.mp4",
    "winpluspharm_video02_assistant_ia.mp4",
    "winpluspharm_video02_assistant_ia_sans_intro.mp4",
    "winpluspharm_video03_command_center.mp4",
    "winpluspharm_video03_command_center_sans_intro.mp4",
  ],
  winmed: ["winmed_promo_preview_v2.mp4", "winmed_promo_reel_final_v2.mp4"],
};

function plan() {
  const files = Object.entries(TREE).flatMap(([app, names]) =>
    names.map((name) => {
      const p = parseFilename(name);
      return { clientId: `${app}/${name}`, applicationId: app, matchKey: p.matchKey, versionType: p.detectedVersionType };
    }),
  );
  const paired = pairPreviewsLoosely(files);
  const suggestions = planAssociations(paired, []);
  const resolved = resolveAssociations(new Map(paired.map((f) => [f.clientId, suggestions.get(f.clientId)?.association ?? null])));
  const groups = new Map<string, string[]>();
  for (const f of paired) {
    const r = resolved.get(f.clientId);
    expect(r?.kind).toBe("new"); // imports never attach to existing creatives
    if (r?.kind === "new") groups.set(r.groupKey, [...(groups.get(r.groupKey) ?? []), f.clientId.split("/")[1]]);
  }
  return { groups: [...groups.values()].map((g) => g.sort()), suggestions };
}

describe("import folder layout", () => {
  it("takes the platform from the folder above banners/ or videos/, skipping the wrapper folder", () => {
    expect(platformFolder(["data_creatives", "win+pharma", "banners"])).toEqual({ platform: "win+pharma", category: "BANNER" });
    expect(platformFolder(["data_creatives", "icoral", "videos"])).toEqual({ platform: "icoral", category: null });
    expect(platformFolder(["newplatform", "Videos"])).toEqual({ platform: "newplatform", category: null });
    expect(platformFolder(["banners"])).toEqual({ platform: null, category: "BANNER" });
    expect(platformFolder(["data_creatives", "cms-whatsapp-sender", "pdf"])).toEqual({ platform: "cms-whatsapp-sender", category: "DOCUMENT" });
    expect(platformFolder(["Beta", "Summer"])).toBeNull();
  });
});

describe("pairing the real data_creatives folder", () => {
  it("pairs every preview with its full version, including _reel and _final names", () => {
    const { groups, suggestions } = plan();
    const previews = Object.values(TREE).flat().filter((n) => parseFilename(n).isPreview);
    expect(previews).toHaveLength(34);
    // Every preview sits in a group with exactly one full version.
    for (const name of previews) {
      const group = groups.find((g) => g.includes(name))!;
      expect(group.filter((n) => !parseFilename(n).isPreview), name).toHaveLength(1);
    }
    expect(groups).toContainEqual(["winpluspharm_01_ocr_bl_preview.mp4", "winpluspharm_01_ocr_bl_reel.mp4"]);
    expect(groups).toContainEqual(["winmed_promo_preview_v2.mp4", "winmed_promo_reel_final_v2.mp4"]);
    expect(groups).toContainEqual(["icoral-anim01-3d-conseil-preview.mp4", "icoral-anim01-3d-conseil.mp4"]);
    expect(groups).toContainEqual(["winpluspharm_instagram_reel.mp4", "winpluspharm_instagram_reel_preview.mp4"]);
    // Videos without a lite version stay on their own, and nothing needs a manual decision.
    expect(groups).toContainEqual(["winpluspharm_scenario_01_sans_intro.mp4"]);
    expect(groups).toContainEqual(["winpluspharm_v01_ocr_bl.mp4"]);
    expect(Object.values(TREE).flat()).toHaveLength(90);
    expect(groups).toHaveLength(90 - 34);
    // PDFs are never previews; each becomes its own creative.
    expect(groups).toContainEqual(["05-Storyboard-FR.pdf"]);
    expect([...suggestions.values()].filter((s) => s.needsDecision)).toHaveLength(0);
  });

  it("ignores reel/final only for loose pairing", () => {
    expect(looseMatchKey("winmed_promo_reel_final_v2")).toBe("winmed_promo_v2");
    expect(looseMatchKey("reel")).toBe("reel");
  });

  it("leaves a preview unpaired when two full versions could match", () => {
    const files = ["spot_reel.mp4", "spot_final.mp4", "spot_preview.mp4"].map((n) => {
      const p = parseFilename(n);
      return { clientId: n, applicationId: "a", matchKey: p.matchKey, versionType: p.detectedVersionType };
    });
    expect(pairPreviewsLoosely(files).find((f) => f.clientId === "spot_preview.mp4")!.matchKey).toBe("spot");
  });
});

describe("badges from filenames", () => {
  const badges = [{ name: "Higgsfield" }, { name: "3D" }, { name: "Motion graphique" }, { name: "Sans intro" }];
  it("adds a badge when its name appears as whole words in the filename", () => {
    expect(badgesForFilename(badges, "icoral-s01-liberte-higgsfield-preview.mp4").map((b) => b.name)).toEqual(["Higgsfield"]);
    expect(badgesForFilename(badges, "icoral_product_3d_reel.mp4").map((b) => b.name)).toEqual(["3D"]);
    expect(badgesForFilename(badges, "winpluspharm_scenario_01_sans_intro.mp4").map((b) => b.name)).toEqual(["Sans intro"]);
    expect(badgesForFilename(badges, "icoral-anim03-minimal-prix.mp4")).toEqual([]);
    expect(badgesForFilename(badges, "3dsomething.mp4")).toEqual([]);
  });
});
