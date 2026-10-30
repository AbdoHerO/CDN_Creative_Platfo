import { describe, expect, it } from "vitest";
import { planAssociations, resolveAssociations, type Candidate, type PlanFile } from "@/lib/files/matching";

const APP = "app1";
const file = (clientId: string, matchKey: string, versionType: PlanFile["versionType"] = "FULL", applicationId = APP): PlanFile => ({
  clientId,
  matchKey,
  versionType,
  applicationId,
});
const cand = (creativeId: string, matchKey: string, hasFull: boolean, applicationId = APP): Candidate => ({
  creativeId,
  matchKey,
  hasFull,
  applicationId,
  name: creativeId,
  status: "DRAFT",
});

describe("planAssociations", () => {
  it("pairs a full file with its preview in the same batch", () => {
    const plan = planAssociations([file("f", "summer"), file("p", "summer", "PREVIEW")], []);
    expect(plan.get("f")!.association).toEqual({ kind: "new", groupKey: "f" });
    expect(plan.get("p")!.association).toEqual({ kind: "withFile", clientId: "f" });
    const resolved = resolveAssociations(new Map([...plan].map(([k, v]) => [k, v.association])));
    expect(resolved.get("p")).toEqual(resolved.get("f"));
  });

  it("keeps a preview uploaded first as an unmatched preview-only creative", () => {
    const plan = planAssociations([file("p", "summer", "PREVIEW")], []);
    expect(plan.get("p")!.association).toEqual({ kind: "new", groupKey: "p" });
    expect(plan.get("p")!.reason).toMatch(/unmatched preview/i);
  });

  it("automatically completes a preview-only creative when its full version arrives", () => {
    const plan = planAssociations([file("f", "summer")], [cand("c1", "summer", false)]);
    expect(plan.get("f")!.association).toEqual({ kind: "existing", creativeId: "c1" });
    expect(plan.get("f")!.needsDecision).toBe(false);
  });

  it("attaches a preview to the single existing creative with the same name", () => {
    const plan = planAssociations([file("p", "summer", "PREVIEW")], [cand("c1", "summer", true)]);
    expect(plan.get("p")!.association).toEqual({ kind: "existing", creativeId: "c1" });
  });

  it("asks the user when a full file collides with a creative that already has a full version", () => {
    const plan = planAssociations([file("f", "summer")], [cand("c1", "summer", true)]);
    expect(plan.get("f")!.association).toBeNull();
    expect(plan.get("f")!.needsDecision).toBe(true);
  });

  it("asks the user when several existing creatives match", () => {
    const plan = planAssociations([file("p", "summer", "PREVIEW")], [cand("c1", "summer", true), cand("c2", "summer", true)]);
    expect(plan.get("p")!.needsDecision).toBe(true);
    expect(plan.get("p")!.candidates).toHaveLength(2);
  });

  it("never guesses when several full files share a name, and asks for their previews", () => {
    const plan = planAssociations([file("a", "summer"), file("b", "summer"), file("p", "summer", "PREVIEW")], []);
    expect(plan.get("a")!.association?.kind).toBe("new");
    expect(plan.get("b")!.association?.kind).toBe("new");
    expect(plan.get("p")!.needsDecision).toBe(true);
  });

  it("never matches across applications", () => {
    const plan = planAssociations([file("p", "summer", "PREVIEW", "app2")], [cand("c1", "summer", true, "app1")]);
    expect(plan.get("p")!.association).toEqual({ kind: "new", groupKey: "p" });
    expect(plan.get("p")!.candidates).toHaveLength(0);
  });

  it("does not link unrelated names", () => {
    const plan = planAssociations([file("f", "summer"), file("p", "winter", "PREVIEW")], []);
    expect(plan.get("p")!.association).toEqual({ kind: "new", groupKey: "p" });
  });
});

describe("resolveAssociations", () => {
  it("follows withFile chains", () => {
    const r = resolveAssociations(
      new Map([
        ["a", { kind: "new", groupKey: "a" }],
        ["b", { kind: "withFile", clientId: "a" }],
        ["c", { kind: "withFile", clientId: "b" }],
      ]),
    );
    expect(r.get("c")).toEqual({ kind: "new", groupKey: "a" });
  });

  it("returns null for cycles and undecided files", () => {
    const r = resolveAssociations(
      new Map([
        ["a", { kind: "withFile", clientId: "b" }],
        ["b", { kind: "withFile", clientId: "a" }],
        ["c", null],
        ["d", { kind: "withFile", clientId: "c" }],
      ]),
    );
    expect(r.get("a")).toBeNull();
    expect(r.get("c")).toBeNull();
    expect(r.get("d")).toBeNull();
  });
});
