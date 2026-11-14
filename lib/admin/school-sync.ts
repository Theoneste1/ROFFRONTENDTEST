/**
 * Official-directory sync (backend src/schools/sync/**): pure rules for the sync pages
 * (unit-tested in tests/school-sync.test.mjs). Mirrors the backend's review rules
 * (sync/review/sync-decisions.ts) so the page offers only what the backend accepts; the backend
 * stays the authority and every refusal is shown.
 *
 *   access        the whole feature needs the `schoolDirectorySync` capability AND schools.manage;
 *                 approve / apply (and deciding a RESOLVE_CONFLICT change) only schools.syncDirectory
 *                 (Super Admins). Never decided by role.
 *   decisions     CHANGE, ADD_CONTACT and NEW_PLACE individually only; FILL_EMPTY, ADD_LEVEL,
 *                 ADD_PROGRAMME, CREATE_SCHOOL and NAME_RESTORE also by category (bound to the
 *                 category's listDigest); RESOLVE_CONFLICT only by a Super Admin
 *   approve       PREVIEW, not expired, no blockers
 *   apply         with the token of an approval of the CURRENT review generation, before it expires
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { errorMessage, isApiError } from "../api/errors";
import type {
  SyncApproval,
  SyncBlocker,
  SyncCategory,
  SyncChange,
  SyncChangeKind,
  SyncConflictState,
  SyncDecision,
  SyncDecisionsInput,
  SyncItem,
  SyncItemOutcome,
  SyncProposalInput,
  SyncReviewSummary,
  SyncRun,
  SyncRunStatus,
} from "../api/school-sync";
import type { Permission } from "../api/types";

// ─── Access ─────────────────────────────────────────────────────────────────

export interface SyncAccess {
  loading: boolean;
  /** Runs, reports and review (schools.manage). */
  visible: boolean;
  /** Approve and apply (schools.syncDirectory: Super Admins only). */
  canApprove: boolean;
}

/**
 * Strict: only a definite permission list and a NEW backend advertising `schoolDirectorySync`
 * show anything (a failed permission load shows nothing — the backend would refuse anyway).
 */
export function syncAccess(input: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
}): SyncAccess {
  const loading = input.permissionsStatus === "loading" || (input.detection === undefined && input.detectionLoading);
  if (loading) return { loading, visible: false, canApprove: false };
  const visible = input.permissionsStatus === "ready" && hasFeature(input.detection, "schoolDirectorySync") && input.can("schools.manage");
  return { loading: false, visible, canApprove: visible && input.can("schools.syncDirectory") };
}

// ─── Files ──────────────────────────────────────────────────────────────────

/** Backend SYNC_MAX_BYTES. */
export const SYNC_MAX_BYTES = 10 * 1024 * 1024;

export function syncFileProblem(file: { name: string; size: number } | null | undefined): string | null {
  if (!file) return "Choose the source export (.xlsx or .csv).";
  if (!/\.(csv|xlsx)$/i.test(file.name)) return "The export must be an .xlsx or .csv file.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > SYNC_MAX_BYTES) return "The file is larger than 10 MB.";
  return null;
}

export function labelProblem(label: string): string | null {
  const l = label.trim();
  if (!l) return null;
  return l.length < 3 || l.length > 200 ? "The label must be 3–200 characters." : null;
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export const RUN_STATUS_LABEL: Record<SyncRunStatus, string> = {
  PREVIEW: "Dry run (in review)",
  APPLIED: "Applied",
  EXPIRED: "Expired",
  SUPERSEDED: "Superseded",
};

export const OUTCOME_LABEL: Record<SyncItemOutcome, string> = {
  MATCHED: "Matched",
  NEW: "New school",
  DUPLICATE_ROW: "Repeated row",
  CONFLICT: "Conflict",
  POSSIBLE_DUPLICATE: "Possible duplicate",
  INVALID: "Invalid row",
  MISSING_FROM_SOURCE: "Not in the source",
};

export const KIND_LABEL: Record<SyncChangeKind, string> = {
  CREATE_SCHOOL: "Create school",
  FILL_EMPTY: "Fill an empty field",
  CHANGE: "Change a field",
  NAME_RESTORE: "Restore the published name",
  NEW_PLACE: "New place (sector)",
  ADD_CONTACT: "Add a contact",
  ADD_LEVEL: "Add an education level",
  ADD_PROGRAMME: "Add a programme",
  RESOLVE_CONFLICT: "Resolve a conflict",
};

export const DECISION_LABEL: Record<SyncDecision, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };
export const CONFLICT_STATE_LABEL: Record<SyncConflictState, string> = { OPEN: "Open", PROPOSED: "Proposed", RESOLVED: "Resolved" };

const BLOCKER_LABEL: Record<string, string> = {
  RUN_NOT_APPLICABLE: "The run is no longer in review (applied, superseded or expired).",
  DEPENDENCY_NOT_APPROVED: "approved change(s) depend on a new place or new school that is not approved.",
  RESOLUTION_NOT_EFFECTIVE: "approved resolution(s) no longer apply: recompare the run.",
  RESOLUTION_PENDING: "proposed resolution(s) wait for a Super Admin's decision.",
};

export function blockerText(b: SyncBlocker): string {
  const label = BLOCKER_LABEL[b.code];
  if (!label) return `${b.code.toLowerCase().replace(/_/g, " ")} (${b.count})`;
  return b.code === "RUN_NOT_APPLICABLE" ? label : `${b.count.toLocaleString("en-US")} ${label}`;
}

// ─── Decisions ──────────────────────────────────────────────────────────────

export const CATEGORY_KINDS: readonly SyncChangeKind[] = ["FILL_EMPTY", "ADD_LEVEL", "ADD_PROGRAMME", "CREATE_SCHOOL", "NAME_RESTORE"];
export const INDIVIDUAL_ONLY_KINDS: readonly SyncChangeKind[] = ["CHANGE", "ADD_CONTACT", "NEW_PLACE"];
export const SUPER_ADMIN_KINDS: readonly SyncChangeKind[] = ["RESOLVE_CONFLICT"];

/** A run can be reviewed (decisions, proposals, recompare) while it is PREVIEW and not expired. */
export function runOpen(run: Pick<SyncRun, "status" | "expiresAt">, now: Date = new Date()): boolean {
  return run.status === "PREVIEW" && new Date(run.expiresAt).getTime() > now.getTime();
}

/** Why the user cannot decide this change now, or null. */
export function decisionBlocked(change: Pick<SyncChange, "kind" | "appliedAt">, ctx: { open: boolean; superAdmin: boolean }): string | null {
  if (!ctx.open) return "The run is no longer in review.";
  if (change.appliedAt) return "Already applied.";
  if (SUPER_ADMIN_KINDS.includes(change.kind) && !ctx.superAdmin) return "Only a Super Admin decides a resolution.";
  return null;
}

/** The categories that can be approved as a whole now: category kinds with pending changes. */
export function approvableCategories(categories: readonly SyncCategory[]): SyncCategory[] {
  return categories.filter((c) => CATEGORY_KINDS.includes(c.kind) && c.pending > 0);
}

/** `POST …/decisions` body approving whole categories (each bound to the digest of the list the user saw). */
export function categoryDecisions(categories: readonly SyncCategory[], kinds: readonly SyncChangeKind[], note = ""): SyncDecisionsInput {
  const chosen = approvableCategories(categories).filter((c) => kinds.includes(c.kind));
  const out: SyncDecisionsInput = { categories: chosen.map((c) => ({ kind: c.kind, listDigest: c.listDigest })) };
  if (note.trim()) out.note = note.trim();
  return out;
}

/** `POST …/decisions` body for individual decisions; unchanged decisions are left out. */
export function individualDecisions(
  changes: ReadonlyArray<Pick<SyncChange, "id" | "decision">>,
  wanted: Readonly<Record<string, SyncDecision>>,
  note = "",
): SyncDecisionsInput {
  const current = new Map(changes.map((c) => [c.id, c.decision]));
  const decisions = Object.entries(wanted)
    .filter(([id, d]) => current.has(id) && current.get(id) !== d)
    .map(([changeId, decision]) => ({ changeId, decision }));
  const out: SyncDecisionsInput = { decisions };
  if (note.trim()) out.note = note.trim();
  return out;
}

// ─── Approve / apply ────────────────────────────────────────────────────────

export function approveState(summary: SyncReviewSummary | undefined, access: SyncAccess, now: Date = new Date()): { allowed: boolean; reason: string | null } {
  if (!access.canApprove) return { allowed: false, reason: "Only a Super Admin can approve and apply a sync." };
  if (!summary) return { allowed: false, reason: "Loading the review…" };
  if (!runOpen(summary.run, now)) return { allowed: false, reason: "The run is no longer in review." };
  if (summary.blockers.length) return { allowed: false, reason: summary.blockers.map(blockerText).join(" ") };
  return { allowed: true, reason: null };
}

/** Apply needs the token of an approval for the CURRENT review generation that has not expired. */
export function applyState(
  approval: Pick<SyncApproval, "token" | "expiresAt" | "reviewGeneration"> | null,
  summary: SyncReviewSummary | undefined,
  access: SyncAccess,
  now: Date = new Date(),
): { allowed: boolean; reason: string | null } {
  if (!access.canApprove) return { allowed: false, reason: "Only a Super Admin can apply a sync." };
  if (!summary || !runOpen(summary.run, now)) return { allowed: false, reason: "The run is no longer in review." };
  if (!approval) return { allowed: false, reason: "Approve the reviewed run first." };
  if (approval.reviewGeneration !== summary.run.reviewGeneration || !summary.run.approvalCurrent) {
    return { allowed: false, reason: "The review changed after the approval: approve it again." };
  }
  if (new Date(approval.expiresAt).getTime() <= now.getTime()) return { allowed: false, reason: "The approval expired (30 minutes): approve it again." };
  return { allowed: true, reason: null };
}

// ─── Proposals ──────────────────────────────────────────────────────────────

export const isManualReview = (item: Pick<SyncItem, "outcome" | "details">) =>
  item.outcome === "CONFLICT" || item.outcome === "POSSIBLE_DUPLICATE" ||
  item.details?.resolvedFrom === "CONFLICT" || item.details?.resolvedFrom === "POSSIBLE_DUPLICATE";

export interface ProposalForm {
  action: "LINK" | "CREATE";
  schoolId: string;
  code: string;
  note: string;
}

/** The problem with a proposal before sending, or null. */
export function proposalProblem(item: Pick<SyncItem, "outcome" | "details" | "conflictState">, f: ProposalForm, runStatus: SyncRunStatus): string | null {
  if (!isManualReview(item)) return "Only conflicts and possible duplicates are resolved by review.";
  if (item.conflictState === "RESOLVED") return "This row is already resolved.";
  if (runStatus === "APPLIED" && f.action !== "LINK") return "After apply a row can only be linked to an existing school.";
  if (f.action === "LINK") {
    if (!f.schoolId) return "Choose the school this row is.";
    const candidates = item.details?.candidates;
    const possibleDuplicate = item.outcome === "POSSIBLE_DUPLICATE" || item.details?.resolvedFrom === "POSSIBLE_DUPLICATE";
    if (possibleDuplicate && !(candidates ?? []).some((c) => c.id === f.schoolId)) return "A possible duplicate can only be linked to one of its listed candidates.";
  }
  const code = f.code.trim();
  if (code) {
    if (runStatus === "APPLIED") return "After apply, set a code with the school's edit instead.";
    if (!/^\d{6}$/.test(code)) return "A school code is exactly 6 digits.";
  }
  const note = f.note.trim();
  if (note && (note.length < 3 || note.length > 500)) return "The note must be 3–500 characters.";
  return null;
}

export function proposalPayload(f: ProposalForm): SyncProposalInput {
  const out: SyncProposalInput = { action: f.action };
  if (f.action === "LINK" && f.schoolId) out.schoolId = f.schoolId;
  if (f.code.trim()) out.code = f.code.trim();
  if (f.note.trim()) out.note = f.note.trim();
  return out;
}

// ─── Values ─────────────────────────────────────────────────────────────────

/** A change value as text (contact values arrive masked; objects are summarised). */
export function showValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(showValue).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.masked === "string") return `${typeof o.type === "string" ? o.type.toLowerCase() + " " : ""}${o.masked}`;
    if ("province" in o || "district" in o || "sector" in o) return [o.sector, o.district, o.province].filter(Boolean).map(String).join(", ");
    if (typeof o.action === "string") return `${o.action === "LINK" ? "Link to an existing school" : "Create a new school"}${o.code ? ` (code ${String(o.code)})` : ""}`;
    if (typeof o.name === "string") return `${o.name}${o.code ? ` (${String(o.code)})` : ""}`;
    if (typeof o.code === "string") return `${o.code}${o.qualifier ? ` ${String(o.qualifier)}` : ""}`;
    return Object.entries(o).map(([k, x]) => `${k}: ${showValue(x)}`).join("; ");
  }
  return String(v);
}

/** The run's counts as label → number lines (non-zero only, in the outcome order). */
export function outcomeLines(outcomes: Partial<Record<SyncItemOutcome, number>> | undefined): Array<[SyncItemOutcome, number]> {
  return (Object.keys(OUTCOME_LABEL) as SyncItemOutcome[]).flatMap((k) => ((outcomes?.[k] ?? 0) > 0 ? [[k, outcomes![k]!] as [SyncItemOutcome, number]] : []));
}

/** Maps a refused sync request (branching on `code`). */
export function syncErrorMessage(err: unknown): string {
  if (!isApiError(err)) return errorMessage(err);
  const d = (err.details && typeof err.details === "object" ? err.details : {}) as Record<string, unknown>;
  switch (err.code) {
    case "SYNC_REVIEW_INCOMPLETE":
      return `The review is not complete: ${Array.isArray(d.blockers) ? (d.blockers as SyncBlocker[]).map(blockerText).join(" ") : err.message}`;
    case "CATEGORY_LIST_CHANGED":
      return "The list changed since you loaded it. It has been reloaded: review it and approve again.";
    case "DEPENDENCY_NOT_APPROVED":
      return "Approve the new place or the new school this change depends on first.";
    case "SUPER_ADMIN_ONLY":
      return "Only a Super Admin can decide a resolution.";
    case "RUN_NOT_APPLICABLE":
      return "The run can no longer be reviewed or applied (applied, superseded or expired). Upload the export again.";
    case "RECOMPARE_CONFLICT":
      return "The run kept changing while it was compared again; try again.";
    case "UNKNOWN_SYNC_DATASET":
      return "Unknown dataset.";
    case "SYNC_SOURCE_MISSING":
      return "The data source of this dataset is not configured on the server.";
    default:
      return errorMessage(err);
  }
}
