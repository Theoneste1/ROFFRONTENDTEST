/**
 * Question-level marking (capability `questionMarking`; design Rev 5.2): the pure rules of the coach's question queue and
 * workspace and the staff's Question marking tab — when they show, labels and badges, the marks of one question (a whole
 * number from 0 to the question's maximum), what each refusal means in plain words, the coach's saved "Show" choice and
 * the heartbeat. Unit-tested in tests/question-marking.test.mjs. The backend is the authority for every rule (one holder
 * per question of a paper, the limit of 3, the 30-minute hold, authorisation, blindness, the transition table).
 */
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { AssessmentStatus, CoachTaskState, CoachView, LostReason, MarkingMode, TaskStatus } from "../api/question-marking";

export const TESTS_MARK: Permission = "tests.mark";
export const TESTS_MANAGE: Permission = "tests.manage";
export const TESTS_DISTRIBUTE: Permission = "tests.distribute";
export const TESTS_REVIEW: Permission = "tests.review";
export const TESTS_ADJUST_MARKS: Permission = "tests.adjustMarks";

export const REASON_MIN = 3;
export const REASON_MAX = 500;
export const COMMENT_MAX = 2000;
/** The longest a hold lasts without a heartbeat (marking.lockMinutes, default) — shown to coaches. */
export const LOCK_MINUTES = 30;
/** The most questions a coach may hold at once (marking.maxActiveClaims, default) — shown to coaches. */
export const MAX_ACTIVE = 3;

export function questionMarkingSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "questionMarking");
}

/** The coach's "By question" queue: the feature and tests.mark. */
export function coachQueueVisible(detection: BackendDetection | null | undefined, canMark: boolean): boolean {
  return questionMarkingSupported(detection) && canMark;
}

/** The test page's Question marking tab: the feature and any of view-review / distribute / manage. */
export function staffTabVisible(detection: BackendDetection | null | undefined, allowed: boolean): boolean {
  return questionMarkingSupported(detection) && allowed;
}

// ── References ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** `q2` → { order: 2, second: 0 }; `q2-s1` → { order: 2, second: 1 }; anything else: null. */
export function parseRef(ref: string): { order: number; second: number } | null {
  const m = /^q([1-9]\d{0,2})(?:-s([1-9]\d{0,2}))?$/.exec(ref);
  return m ? { order: Number(m[1]), second: m[2] ? Number(m[2]) : 0 } : null;
}

/** "Question 2" or "Question 2 · second assessment" (cycle > 1: "second assessment 2"). */
export function refLabel(ref: string): string {
  const r = parseRef(ref);
  if (!r) return ref;
  return r.second === 0 ? `Question ${r.order}` : `Question ${r.order} · second assessment${r.second > 1 ? ` ${r.second}` : ""}`;
}

/** The workspace path of one task (both parts encoded). */
export const workspacePath = (code: string, ref: string) => `/mentor/marking/q/${encodeURIComponent(code)}/${encodeURIComponent(ref)}`;

// ── Coach views (saved per account, like the paper queue's choice) ─────────────────────────────────────────────────

export const COACH_VIEWS: ReadonlyArray<{ value: CoachView; label: string }> = [
  { value: "TO_MARK", label: "To mark" },
  { value: "MINE", label: "Mine now" },
  { value: "RETURNED", label: "Returned to me" },
  { value: "SUBMITTED", label: "Marked by me" },
  { value: "ALL", label: "All" },
];
export const DEFAULT_COACH_VIEW: CoachView = "TO_MARK";
export const coachViewKey = (userId: string) => `rof.marking.questionView.${userId}`;

type ViewStorage = Pick<Storage, "getItem" | "setItem">;

export function readCoachView(storage: ViewStorage | null | undefined, userId: string): CoachView {
  try {
    const v = storage?.getItem(coachViewKey(userId));
    return COACH_VIEWS.some((o) => o.value === v) ? (v as CoachView) : DEFAULT_COACH_VIEW;
  } catch {
    return DEFAULT_COACH_VIEW;
  }
}

export function saveCoachView(storage: ViewStorage | null | undefined, userId: string, view: CoachView): void {
  try {
    storage?.setItem(coachViewKey(userId), view);
  } catch {
    /* private mode or full: kept for this visit only */
  }
}

// ── Badges (AA contrast) ────────────────────────────────────────────────────────────────────────────────────────────

export const COACH_STATE_BADGE: Record<CoachTaskState, { label: string; className: string }> = {
  MINE: { label: "Marking now", className: "bg-amber-100 text-amber-900" },
  RETURNED_TO_ME: { label: "Returned to you", className: "bg-rose-100 text-rose-900" },
  AVAILABLE: { label: "Available", className: "bg-slate-200 text-slate-800" },
  TAKEN: { label: "Taken by another coach", className: "bg-gray-100 text-gray-700" },
  SUBMITTED_BY_ME: { label: "Marked by you", className: "bg-emerald-100 text-emerald-900" },
};

/** What the coach can do with a row: open (mine, returned), take (available), or nothing (taken, already marked). */
export function coachAction(state: CoachTaskState): "continue" | "take" | "view" | null {
  if (state === "MINE" || state === "RETURNED_TO_ME") return "continue";
  if (state === "AVAILABLE") return "take";
  if (state === "SUBMITTED_BY_ME") return "view";
  return null;
}

export const TASK_STATUS_BADGE: Record<TaskStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: "Not started", className: "bg-slate-200 text-slate-800" },
  IN_PROGRESS: { label: "Being marked", className: "bg-amber-100 text-amber-900" },
  SUBMITTED: { label: "Awaiting review", className: "bg-sky-100 text-sky-900" },
  UNDER_REVIEW: { label: "Under review", className: "bg-indigo-100 text-indigo-900" },
  RETURNED: { label: "Returned", className: "bg-rose-100 text-rose-900" },
  AWAITING_SECOND: { label: "Second assessment", className: "bg-violet-100 text-violet-900" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-900" },
  CLOSED: { label: "Closed", className: "bg-gray-100 text-gray-700" },
  CANCELLED: { label: "Cancelled", className: "bg-gray-100 text-gray-700" },
};

export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", RETURNED: "Returned", APPROVED: "Approved", SUPERSEDED: "Replaced", ABANDONED: "Given back",
};

export const MODE_LABEL: Record<MarkingMode, string> = { PAPER: "By paper", QUESTION: "By question" };

// ── Marks of one question ───────────────────────────────────────────────────────────────────────────────────────────

/** "" → null (not marked yet); a whole number 0…max → the number; anything else → an error in plain words. */
export function parseQuestionMarks(text: string, max: number): { ok: true; marks: number | null } | { ok: false; error: string } {
  const t = text.trim();
  if (t === "") return { ok: true, marks: null };
  if (!/^\d+$/.test(t)) return { ok: false, error: `Enter a whole number from 0 to ${max}.` };
  const n = Number(t);
  if (n > max) return { ok: false, error: `This question is out of ${max}. Enter ${max} or less.` };
  return { ok: true, marks: n };
}

/** Submit needs marks for the question (0 is a mark); the comment is optional (at most COMMENT_MAX characters). */
export function submitProblem(marks: number | null, comment: string): string | null {
  if (marks === null) return "Enter the marks for this question before submitting.";
  if (comment.length > COMMENT_MAX) return `Shorten the comment to ${COMMENT_MAX} characters.`;
  return null;
}

export function reasonProblem(reason: string): string | null {
  const t = reason.trim();
  if (t.length < REASON_MIN) return `Give a reason (at least ${REASON_MIN} characters).`;
  if (t.length > REASON_MAX) return `Shorten the reason to ${REASON_MAX} characters.`;
  return null;
}

// ── The hold ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The heartbeat interval in ms (the server's heartbeatSeconds; 120 s when missing; never below 30 s). */
export function heartbeatMs(seconds: number | null | undefined): number {
  const s = Number.isFinite(seconds) && (seconds as number) > 0 ? (seconds as number) : 120;
  return Math.max(30, s) * 1000;
}

/** Minutes left on a hold, rounded down (0 when past). */
export function minutesLeft(lockExpiresAt: string | null, now: number): number | null {
  if (!lockExpiresAt) return null;
  return Math.max(0, Math.floor((Date.parse(lockExpiresAt) - now) / 60_000));
}

/** The read-only notice when a hold ended, by its reason (what happened + what to do). */
export const LOST_MESSAGE: Record<LostReason, string> = {
  EXPIRED: `You were away for more than ${LOCK_MINUTES} minutes, so this question went back to the list. Your unsaved changes were not kept. Take it again from the list if it is still available.`,
  RELEASED: "You gave this question back. Take it again from the list if it is still available.",
  RELEASED_BY_STAFF: "The Head Coach or an administrator released this question from you. Your draft was kept in the history. Pick another question from the list.",
  REASSIGNED: "This question was assigned to another coach. Pick another question from the list.",
  AUTHORISATION_LOST: "You are no longer authorised to mark this question. Your draft was kept in the history. Contact the Head Coach if this is a mistake.",
  CANCELLED: "This second assessment was cancelled. Nothing more is needed from you here.",
  SUBMITTED: "You already submitted this question. It is waiting for review.",
};

export function lostMessage(reason: string | null | undefined): string {
  return LOST_MESSAGE[(reason ?? "EXPIRED") as LostReason] ?? LOST_MESSAGE.EXPIRED;
}

/** Plain words for the coach's refusals (the backend's codes); null: use the server's own message. */
export function coachRefusal(code: string | undefined): string | null {
  switch (code) {
    case "TASK_TAKEN": return "Another coach took this question a moment ago. Pick another one from the list.";
    case "CLAIM_LIMIT": return `You are already marking ${MAX_ACTIVE} questions. Submit or give one back before taking another.`;
    case "TASK_NOT_AVAILABLE": return "This question is no longer available. The list has been refreshed.";
    case "QUESTION_NOT_ASSIGNED": return "You are not assigned to this question. Ask the Head Coach to add you to it.";
    case "MARKER_NOT_AUTHORIZED": return "You are not authorised to mark this subject. Ask the Head Coach.";
    case "FIRST_MARKER_EXCLUDED": return "You marked this answer first, so another coach must do the second assessment.";
    case "RESUBMISSION_PENDING": return "The student is allowed to send a new version of this paper. Wait until it arrives or the permission ends.";
    case "MARKING_CHANGED": return "These marks were changed in another window. Reload to see the latest before saving.";
    case "MARKS_INVALID": return "Enter a whole number from 0 to the question's maximum.";
    case "MARKS_INCOMPLETE": return "Enter the marks for this question before submitting.";
    case "FEATURE_DISABLED": return "Marking by question is switched off at the moment. Contact the Rwanda Olympiad Foundation team.";
    default: return null;
  }
}

/** Plain words for the staff's refusals; null: the server's own message. */
export function staffRefusal(code: string | undefined): string | null {
  switch (code) {
    case "TASK_CHANGED": return "Someone else changed this question a moment ago. The latest is shown; check it and try again.";
    case "MARKING_STARTED": return "Marking has started on this test, so the marking mode can no longer change.";
    case "NO_QUESTIONS": return "Add the questions (with their marks) before choosing marking by question.";
    case "CLAIM_LIMIT": return `That coach is already marking ${MAX_ACTIVE} questions. Choose another coach or wait.`;
    case "DECISION_REQUIRED": return "Both assessments are in: decide the marks (Head Coach) instead.";
    case "STRUCTURE_FROZEN": return "Marking has started: only a Super Administrator can correct the questions, with a reason.";
    case "REASON_REQUIRED": return `Give a reason (at least ${REASON_MIN} characters).`;
    default: return coachRefusal(code);
  }
}

/** Paper progress label for the staff overview (the backend's paperProgress keys). */
export const PAPER_PROGRESS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started", PARTIALLY_MARKED: "Being marked", ALL_SUBMITTED: "All questions marked",
  PARTIALLY_APPROVED: "Partly approved", RETURNED_WORK: "Returned work", FULLY_APPROVED: "All questions approved",
};
