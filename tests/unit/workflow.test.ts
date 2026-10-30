import { describe, expect, it } from "vitest";
import { availableActions, planTransition, WorkflowError } from "@/lib/workflow";

describe("validation workflow", () => {
  it("follows DRAFT → PENDING → IN_REVIEW → APPROVED", () => {
    expect(planTransition("submit", "DRAFT")).toEqual([{ action: "SUBMITTED", from: "DRAFT", to: "PENDING" }]);
    expect(planTransition("startReview", "PENDING")).toEqual([{ action: "REVIEW_STARTED", from: "PENDING", to: "IN_REVIEW" }]);
    expect(planTransition("approve", "IN_REVIEW")).toEqual([{ action: "APPROVED", from: "IN_REVIEW", to: "APPROVED" }]);
  });

  it("records an explicit review step when approving straight from PENDING", () => {
    expect(planTransition("approve", "PENDING")).toEqual([
      { action: "REVIEW_STARTED", from: "PENDING", to: "IN_REVIEW" },
      { action: "APPROVED", from: "IN_REVIEW", to: "APPROVED" },
    ]);
  });

  it("requires a reason to decline", () => {
    expect(() => planTransition("decline", "IN_REVIEW")).toThrow(WorkflowError);
    expect(() => planTransition("decline", "IN_REVIEW", { comment: "  " })).toThrow(/reason/i);
    expect(planTransition("decline", "IN_REVIEW", { comment: "Wrong logo" })[0].to).toBe("DECLINED");
  });

  it("allows a declined creative to be resubmitted", () => {
    expect(planTransition("submit", "DECLINED")[0]).toEqual({ action: "SUBMITTED", from: "DECLINED", to: "PENDING" });
  });

  it("requires a comment when requesting changes and returns to draft", () => {
    expect(() => planTransition("requestChanges", "IN_REVIEW")).toThrow(WorkflowError);
    expect(planTransition("requestChanges", "IN_REVIEW", { comment: "Shorten intro" })[0].to).toBe("DRAFT");
  });

  it("rejects invalid transitions", () => {
    expect(() => planTransition("approve", "DRAFT")).toThrow(WorkflowError);
    expect(() => planTransition("submit", "APPROVED")).toThrow(WorkflowError);
    expect(() => planTransition("restore", "DRAFT")).toThrow(WorkflowError);
    expect(() => planTransition("archive", "ARCHIVED")).toThrow(WorkflowError);
  });

  it("restores archived creatives to their previous status", () => {
    expect(planTransition("restore", "ARCHIVED", { archivedFromStatus: "APPROVED" })[0].to).toBe("APPROVED");
    expect(planTransition("restore", "ARCHIVED", { archivedFromStatus: "IN_REVIEW" })[0].to).toBe("PENDING");
    expect(planTransition("restore", "ARCHIVED", { archivedFromStatus: null })[0].to).toBe("DRAFT");
  });

  it("lists available actions per status", () => {
    expect(availableActions("DRAFT")).toEqual(expect.arrayContaining(["submit", "archive"]));
    expect(availableActions("PENDING")).toEqual(expect.arrayContaining(["startReview", "approve", "decline", "withdraw"]));
    expect(availableActions("ARCHIVED")).toEqual(["restore"]);
  });
});
