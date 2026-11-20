/**
 * Test Management, Phase 3 (capability `testMarking`): the pure rules of the distribution, review, history and marking
 * screens — when menus, tabs and pages show, labels and badges, the marks form (whole numbers, never above a maximum)
 * and the mandatory reasons. Unit-tested in tests/test-marking.test.mjs. The backend remains the authority: it checks
 * every permission, the transition table, G5 (marking only after the latest deadline), the maxima and blindness.
 */
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { SubmissionStatus } from "../api/test-submissions";
import type { MarkingKind, MarkingStatus, MarksBody, QueueState, ReviewAction, ScoreValue } from "../api/test-marking";

export const TESTS_DISTRIBUTE: Permission = "tests.distribute";
export const TESTS_REVIEW: Permission = "tests.review";
export const TESTS_ADJUST_MARKS: Permission = "tests.adjustMarks";
export const TESTS_MARK: Permission = "tests.mark";

/** Reasons and comments (the backend's limits). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const COMMENT_MAX = 2000;

export function testMarkingSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "testMarking");
}

/** The coach's Marking menu item: a backend with `testMarking` AND the known tests.mark. */
export function markingNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null): boolean {
  return testMarkingSupported(detection) && !!permissions && permissions.has(TESTS_MARK);
}

/** The test page's Phase 3 tabs (Markers & distribution, Review, History): the feature and the permission. */
export function markingTabVisible(detection: BackendDetection | undefined, allowed: boolean): boolean {
  return testMarkingSupported(detection) && allowed;
}

export type MarkingPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

export function markingPageMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
}): MarkingPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!testMarkingSupported(opts.detection)) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(TESTS_MARK) ? "visible" : "forbidden";
}

// ── Labels and badges (AA contrast) ─────────────────────────────────────────────

export const QUEUE_BADGE: Record<QueueState, { label: string; className: string }> = {
  NOT_STARTED: { label: "Not started", className: "bg-slate-200 text-slate-800" },
  IN_PROGRESS: { label: "In progress", className: "bg-amber-100 text-amber-900" },
  MARKED: { label: "Marked", className: "bg-emerald-100 text-emerald-900" },
};

export const QUEUE_FILTERS: ReadonlyArray<{ label: string; value: "" | QueueState }> = [
  { label: "All", value: "" },
  { label: "Not started", value: "NOT_STARTED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Marked", value: "MARKED" },
];

export const MARKING_STATUS_BADGE: Record<MarkingStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-200 text-slate-800" },
  SUBMITTED: { label: "Submitted", className: "bg-sky-100 text-sky-900" },
  RETURNED: { label: "Returned", className: "bg-rose-100 text-rose-900" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-900" },
};

export const STATUS_BADGE: Record<SubmissionStatus, string> = {
  SUBMITTED: "bg-slate-200 text-slate-800",
  ASSIGNED: "bg-indigo-100 text-indigo-900",
  MARKING_IN_PROGRESS: "bg-amber-100 text-amber-900",
  MARKED: "bg-sky-100 text-sky-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  PUBLISHED: "bg-emerald-200 text-emerald-950",
  RETURNED: "bg-rose-100 text-rose-900",
  AWAITING_SECOND_MARKING: "bg-violet-100 text-violet-900",
};

/** The review list's status filter (Published belongs to Phase 4). */
export const REVIEW_FILTERS: ReadonlyArray<{ label: string; value: "" | SubmissionStatus }> = [
  { label: "All", value: "" },
  { label: "Not assigned", value: "SUBMITTED" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "Marking", value: "MARKING_IN_PROGRESS" },
  { label: "Awaiting approval", value: "MARKED" },
  { label: "Returned", value: "RETURNED" },
  { label: "Second marking", value: "AWAITING_SECOND_MARKING" },
  { label: "Approved", value: "APPROVED" },
];

export const KIND_LABEL: Record<MarkingKind, string> = { FIRST: "First marking", SECOND: "Second marking", ADJUSTMENT: "Adjusted" };

export const REVIEW_ACTION_LABEL: Record<ReviewAction, string> = {
  APPROVED: "Approved",
  RETURNED: "Returned for correction",
  SECOND_MARKING_REQUESTED: "Second marking requested",
  MARK_CHOSEN: "Mark chosen",
  UNLOCKED: "Unlocked",
};

export const ASSIGNMENT_METHOD_LABEL: Record<"DISTRIBUTION" | "MANUAL" | "REASSIGNMENT" | "SECOND_MARKING", string> = {
  DISTRIBUTION: "distribution", MANUAL: "manual", REASSIGNMENT: "reassignment", SECOND_MARKING: "second marking",
};

// ── Distribution ────────────────────────────────────────────────────────────────

/** What an even distribution gives each coach: "2 coaches: 5 or 6 each" (before the backend's own count). */
export function evenShareText(submissions: number, coaches: number): string {
  if (coaches <= 0) return "Choose at least one coach.";
  if (submissions <= 0) return "Nothing to distribute now.";
  const low = Math.floor(submissions / coaches);
  const high = Math.ceil(submissions / coaches);
  const who = coaches === 1 ? "1 coach" : `${coaches} coaches`;
  return low === high ? `${who}: ${low} each` : `${who}: ${low} or ${high} each`;
}

// ── Marks (G7: whole numbers; never above the maxima) ─────────────────────────

export interface QuestionMax { id: string; order: number; maxMarks: number }

/** The marks form: text fields as typed (validated before sending). */
export interface MarksDraft {
  scores: Record<string, { marks: string; comment: string }>;
  total: string;
  comment: string;
}

/** "" → null (not marked yet); "7" → 7; anything else (2.5, -1, "x") → NaN. */
export function parseWhole(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

export function draftFrom(questions: readonly QuestionMax[], marking: { scores: ScoreValue[]; totalMarks: number | null; comment: string | null } | null): MarksDraft {
  const byId = new Map((marking?.scores ?? []).map((s) => [s.questionId, s]));
  return {
    scores: Object.fromEntries(questions.map((q) => {
      const s = byId.get(q.id);
      return [q.id, { marks: s?.marks == null ? "" : String(s.marks), comment: s?.comment ?? "" }];
    })),
    total: questions.length === 0 && marking?.totalMarks != null ? String(marking.totalMarks) : "",
    comment: marking?.comment ?? "",
  };
}

/**
 * Problems of the form, by field ("q:<id>" for a question, "total", "comment"): marks must be whole and within the
 * maximum; for submitting, every question (or the total) must be marked.
 */
export function marksProblems(questions: readonly QuestionMax[], testMax: number, d: MarksDraft, forSubmit: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const check = (key: string, text: string, max: number) => {
    const v = parseWhole(text);
    if (v === null) { if (forSubmit) out[key] = "Give the marks."; return; }
    if (Number.isNaN(v)) out[key] = "Whole marks only (0 or more).";
    else if (v > max) out[key] = `At most ${max}.`;
  };
  if (questions.length === 0) check("total", d.total, testMax);
  else for (const q of questions) {
    check(`q:${q.id}`, d.scores[q.id]?.marks ?? "", q.maxMarks);
    if ((d.scores[q.id]?.comment ?? "").length > COMMENT_MAX) out[`q:${q.id}:comment`] = `At most ${COMMENT_MAX} characters.`;
  }
  if (d.comment.length > COMMENT_MAX) out.comment = `At most ${COMMENT_MAX} characters.`;
  return out;
}

/** The running total of the form (questions: the sum of the marks given; otherwise the total typed), or null. */
export function draftTotal(questions: readonly QuestionMax[], d: MarksDraft): number | null {
  if (questions.length === 0) {
    const v = parseWhole(d.total);
    return v === null || Number.isNaN(v) ? null : v;
  }
  const given = questions.map((q) => parseWhole(d.scores[q.id]?.marks ?? "")).filter((v): v is number => v !== null && !Number.isNaN(v));
  return given.length ? given.reduce((a, b) => a + b, 0) : null;
}

/** The request body of a valid form (questions that have marks or a comment; or the total). */
export function marksBody(questions: readonly QuestionMax[], d: MarksDraft): MarksBody {
  const comment = d.comment.trim() || null;
  if (questions.length === 0) return { totalMarks: parseWhole(d.total), comment };
  const scores = questions
    .map((q) => ({ questionId: q.id, marks: parseWhole(d.scores[q.id]?.marks ?? ""), comment: (d.scores[q.id]?.comment ?? "").trim() || null }))
    .filter((s) => s.marks !== null || s.comment !== null);
  return { scores, comment };
}

/** A mandatory reason or comment: 3–500 characters (comments of a return: up to 2000). */
export function reasonProblem(text: string, max = REASON_MAX): string | null {
  const t = text.trim();
  if (t.length < REASON_MIN) return `At least ${REASON_MIN} characters.`;
  if (t.length > max) return `At most ${max} characters.`;
  return null;
}

/** "17 / 20" or "—". */
export function marksText(total: number | null | undefined, max: number): string {
  return total == null ? "—" : `${total} / ${max}`;
}
