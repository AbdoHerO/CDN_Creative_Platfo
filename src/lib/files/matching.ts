import type { CreativeStatus, VersionType } from "@/generated/prisma/enums";

/**
 * Association planner for batches of uploaded files (individual uploads and ZIP
 * imports).
 *
 * Rules
 * - Files are grouped by (application, matchKey). Matching never crosses
 *   applications.
 * - One FULL + its `_preview` in the same batch become one creative.
 * - A FULL whose only match is a preview-only creative (preview uploaded first)
 *   completes that creative automatically.
 * - A PREVIEW with exactly one existing match attaches to it automatically.
 * - Anything ambiguous (several candidates, or a FULL whose name collides with a
 *   creative that already has a full version) is left for the user to decide.
 * - Nothing is ever attached silently: every automatic association carries a
 *   human-readable reason shown in the review step.
 */

export type PlanFile = {
  clientId: string;
  applicationId: string;
  matchKey: string;
  versionType: VersionType;
};

export type Candidate = {
  creativeId: string;
  applicationId: string;
  matchKey: string;
  name: string;
  status: CreativeStatus;
  hasFull: boolean;
};

export type Association =
  | { kind: "new"; groupKey: string }
  | { kind: "existing"; creativeId: string }
  | { kind: "withFile"; clientId: string };

export type FileSuggestion = {
  clientId: string;
  /** null → the user must choose. */
  association: Association | null;
  needsDecision: boolean;
  reason: string;
  candidates: Candidate[];
  /** Other files of the batch sharing the same match key. */
  peers: string[];
};

export function planAssociations(files: PlanFile[], candidates: Candidate[]): Map<string, FileSuggestion> {
  const result = new Map<string, FileSuggestion>();
  const groups = new Map<string, PlanFile[]>();
  for (const f of files) {
    const key = `${f.applicationId}::${f.matchKey}`;
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  for (const [groupId, group] of groups) {
    const [applicationId, matchKey] = splitGroup(groupId);
    const cands = candidates.filter((c) => c.applicationId === applicationId && c.matchKey === matchKey);
    const previewOnly = cands.filter((c) => !c.hasFull);
    const fulls = group.filter((f) => f.versionType === "FULL");
    const others = group.filter((f) => f.versionType !== "FULL");
    const peersOf = (f: PlanFile) => group.filter((g) => g.clientId !== f.clientId).map((g) => g.clientId);
    const set = (f: PlanFile, association: Association | null, reason: string) =>
      result.set(f.clientId, {
        clientId: f.clientId,
        association,
        needsDecision: association === null,
        reason,
        candidates: cands,
        peers: peersOf(f),
      });

    if (fulls.length === 1) {
      const full = fulls[0];
      if (cands.length === 0) {
        set(full, { kind: "new", groupKey: full.clientId }, "New creative.");
      } else if (cands.length === 1 && previewOnly.length === 1) {
        set(
          full,
          { kind: "existing", creativeId: previewOnly[0].creativeId },
          `Completes “${previewOnly[0].name}”, which only had a preview version so far.`,
        );
      } else {
        set(
          full,
          null,
          cands.length === 1
            ? `A creative named “${cands[0].name}” already exists. Add this as a new full version, or create a separate creative?`
            : `${cands.length} existing creatives match this filename. Choose where this file belongs.`,
        );
      }
      for (const other of others) {
        set(other, { kind: "withFile", clientId: full.clientId }, `Linked to the full version in this batch.`);
      }
      continue;
    }

    if (fulls.length === 0) {
      const [leader, ...rest] = others;
      if (cands.length === 1) {
        for (const f of others) {
          set(f, { kind: "existing", creativeId: cands[0].creativeId }, `Matched to existing creative “${cands[0].name}”.`);
        }
      } else if (cands.length > 1) {
        for (const f of others) {
          set(f, null, `${cands.length} existing creatives match this filename. Choose the correct one.`);
        }
      } else {
        set(
          leader,
          { kind: "new", groupKey: leader.clientId },
          leader.versionType === "PREVIEW"
            ? "No full version found yet. Kept as an unmatched preview; it will be linked when the full version is uploaded."
            : "New creative.",
        );
        for (const f of rest) {
          set(f, { kind: "withFile", clientId: leader.clientId }, "Grouped with a file of the same name in this batch.");
        }
      }
      continue;
    }

    // Several full versions share a name: never guess.
    for (const full of fulls) {
      if (cands.length === 0) {
        set(full, { kind: "new", groupKey: full.clientId }, "New creative (several files in this batch share this name).");
      } else {
        set(full, null, "Several files and existing creatives share this name. Choose where this file belongs.");
      }
    }
    for (const other of others) {
      set(other, null, "Several full versions share this name. Choose which creative this file belongs to.");
    }
  }

  return result;
}

function splitGroup(id: string): [string, string] {
  const idx = id.indexOf("::");
  return [id.slice(0, idx), id.slice(idx + 2)];
}

export type ResolvedAssociation = { kind: "new"; groupKey: string } | { kind: "existing"; creativeId: string };

/**
 * Follow `withFile` references until a concrete association is reached.
 * Returns null for unresolved decisions or reference cycles.
 */
export function resolveAssociations(
  associations: Map<string, Association | null>,
): Map<string, ResolvedAssociation | null> {
  const out = new Map<string, ResolvedAssociation | null>();
  for (const id of associations.keys()) {
    const seen = new Set<string>();
    let current: Association | null | undefined = associations.get(id);
    let currentId = id;
    while (current && current.kind === "withFile") {
      if (seen.has(currentId)) {
        current = null;
        break;
      }
      seen.add(currentId);
      currentId = current.clientId;
      current = associations.get(currentId);
    }
    if (!current) out.set(id, null);
    else if (current.kind === "new") out.set(id, { kind: "new", groupKey: current.groupKey });
    else if (current.kind === "existing") out.set(id, { kind: "existing", creativeId: current.creativeId });
    else out.set(id, null);
  }
  return out;
}
