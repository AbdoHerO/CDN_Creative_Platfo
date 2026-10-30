import { describe, expect, it } from "vitest";
import type { CreativeStatus, RoleKey } from "@/generated/prisma/enums";
import {
  can,
  canArchiveCreative,
  canDeleteCreative,
  canEditCreative,
  canReviewCreative,
  canSubmitCreative,
  canViewCreative,
  type Actor,
} from "@/lib/permissions";
import { creativeVisibilityWhere } from "@/lib/visibility";

const actor = (role: RoleKey, extra: Partial<Actor> = {}): Actor => ({ id: `${role}-1`, role, restrictApplications: false, applicationIds: [], ...extra });
const creative = (status: CreativeStatus, createdById = "CREATOR-1", applicationId = "app1") => ({ status, createdById, applicationId, submittedAt: null });

describe("role permission matrix", () => {
  it("grants administration only to admins", () => {
    expect(can("ADMIN", "user.manage")).toBe(true);
    expect(can("MANAGER", "user.manage")).toBe(false);
    expect(can("ADMIN", "application.manage")).toBe(true);
    expect(can("MANAGER", "application.manage")).toBe(false);
    expect(can("ADMIN", "settings.manage")).toBe(true);
  });

  it("lets managers review and manage campaigns, but not creators or viewers", () => {
    expect(can("MANAGER", "creative.review")).toBe(true);
    expect(can("MANAGER", "campaign.manage")).toBe(true);
    expect(can("CREATOR", "creative.review")).toBe(false);
    expect(can("VIEWER", "creative.review")).toBe(false);
  });

  it("prevents viewers from uploading", () => {
    expect(can("VIEWER", "creative.upload")).toBe(false);
    expect(can("CREATOR", "creative.upload")).toBe(true);
  });
});

describe("resource-level rules", () => {
  it("viewers only see approved creatives", () => {
    expect(canViewCreative(actor("VIEWER"), creative("APPROVED"))).toBe(true);
    expect(canViewCreative(actor("VIEWER"), creative("PENDING"))).toBe(false);
    expect(canViewCreative(actor("VIEWER"), creative("DRAFT"))).toBe(false);
  });

  it("creators see their own drafts but not other people's drafts", () => {
    const me = actor("CREATOR");
    expect(canViewCreative(me, creative("DRAFT", me.id))).toBe(true);
    expect(canViewCreative(me, creative("DRAFT", "someone-else"))).toBe(false);
    expect(canViewCreative(me, creative("PENDING", "someone-else"))).toBe(true);
  });

  it("application restrictions hide other applications entirely", () => {
    const restricted = actor("MANAGER", { restrictApplications: true, applicationIds: ["app1"] });
    expect(canViewCreative(restricted, creative("APPROVED", "x", "app1"))).toBe(true);
    expect(canViewCreative(restricted, creative("APPROVED", "x", "app2"))).toBe(false);
  });

  it("creators edit only their own drafts or declined creatives", () => {
    const me = actor("CREATOR");
    expect(canEditCreative(me, creative("DRAFT", me.id))).toBe(true);
    expect(canEditCreative(me, creative("DECLINED", me.id))).toBe(true);
    expect(canEditCreative(me, creative("PENDING", me.id))).toBe(false);
    expect(canEditCreative(me, creative("APPROVED", me.id))).toBe(false);
    expect(canEditCreative(me, creative("DRAFT", "other"))).toBe(false);
    expect(canEditCreative(actor("MANAGER"), creative("APPROVED", "other"))).toBe(true);
    expect(canEditCreative(actor("VIEWER"), creative("APPROVED", "other"))).toBe(false);
  });

  it("only reviewers can review; creators can submit their own work", () => {
    expect(canReviewCreative(actor("CREATOR"), creative("PENDING"))).toBe(false);
    expect(canReviewCreative(actor("MANAGER"), creative("PENDING"))).toBe(true);
    expect(canSubmitCreative(actor("CREATOR"), creative("DRAFT", "CREATOR-1"))).toBe(true);
    expect(canSubmitCreative(actor("CREATOR"), creative("DRAFT", "other"))).toBe(false);
  });

  it("only admins delete arbitrary creatives; owners may delete never-submitted drafts", () => {
    expect(canDeleteCreative(actor("ADMIN"), creative("APPROVED", "other"))).toBe(true);
    expect(canDeleteCreative(actor("MANAGER"), creative("APPROVED", "other"))).toBe(false);
    expect(canDeleteCreative(actor("CREATOR"), creative("DRAFT", "CREATOR-1"))).toBe(true);
    expect(canDeleteCreative(actor("CREATOR"), { ...creative("DRAFT", "CREATOR-1"), submittedAt: new Date() })).toBe(false);
  });

  it("archiving is for reviewers, or owners of drafts", () => {
    expect(canArchiveCreative(actor("MANAGER"), creative("APPROVED", "x"))).toBe(true);
    expect(canArchiveCreative(actor("CREATOR"), creative("APPROVED", "CREATOR-1"))).toBe(false);
    expect(canArchiveCreative(actor("CREATOR"), creative("DRAFT", "CREATOR-1"))).toBe(true);
  });
});

describe("query scoping", () => {
  it("adds no restriction for unrestricted admins", () => {
    expect(creativeVisibilityWhere(actor("ADMIN"))).toEqual({});
  });

  it("restricts viewers to approved creatives", () => {
    expect(JSON.stringify(creativeVisibilityWhere(actor("VIEWER")))).toContain('"status":"APPROVED"');
  });

  it("restricts by application", () => {
    const where = creativeVisibilityWhere(actor("CREATOR", { restrictApplications: true, applicationIds: ["a", "b"] }));
    expect(JSON.stringify(where)).toContain('"applicationId":{"in":["a","b"]}');
  });
});
