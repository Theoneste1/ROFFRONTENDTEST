/**
 * Test Management, Phase 1 (capability `testManagement`): the pure rules of the Tests screens — when the menu item and
 * the pages show, labels, the details form's checks (the backend's rules), the question sum rule and reordering.
 * Unit-tested in tests/test-management.test.mjs. The backend remains the authority for every rule.
 */
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { QuestionInput, TestAnswerFormat, TestDetailsInput, TestDivision, TestStatus, TestSummary } from "../api/tests";

export const TESTS_VIEW: Permission = "tests.view";
export const TESTS_MANAGE: Permission = "tests.manage";
export const TESTS_MANAGE_MARKERS: Permission = "tests.manageMarkers";

/** Largest maxMarks (backend MAX_TEST_MARKS); whole numbers only (G7). */
export const MAX_TEST_MARKS = 1000;
export const MAX_QUESTIONS = 100;
/** The paper and the marking guide: PDF or images (phone photos included), at most 20 MB. */
export const TEST_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif";
export const TEST_FILE_MAX_BYTES = 20 * 1024 * 1024;

export function testManagementSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "testManagement");
}

/** The menu item (both portals): a backend with `testManagement` AND the known tests.view. */
export function testsNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null): boolean {
  return testManagementSupported(detection) && !!permissions && permissions.has(TESTS_VIEW);
}

export type TestsPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

/** "unsupported" without the capability; "forbidden" without tests.view; otherwise "visible" (after loading). */
export function testsPageMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
}): TestsPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!testManagementSupported(opts.detection)) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(TESTS_VIEW) ? "visible" : "forbidden";
}

// ── Labels ─────────────────────────────────────────────────────────────────────

/**
 * The fixed choices of older backends; with administrator-managed divisions (adminDivisions) the screens use
 * testLevelOptions() / divisionLabel() from lib/divisions with the divisions the backend lists.
 */
export const DIVISION_OPTIONS: ReadonlyArray<{ value: TestDivision; label: string }> = [
  { value: "ALL", label: "All (S1–S6)" },
  { value: "JUNIOR", label: "Junior (S1–S3)" },
  { value: "SENIOR", label: "Senior (S4–S6)" },
];
/** Built-in names (the screens prefer the divisions the backend lists: useDivisionLabel). */
export const DIVISION_LABEL: Record<string, string> = { ALL: "All", JUNIOR: "Junior", MIDDLE: "Middle", SENIOR: "Senior" };

export const ANSWER_FORMAT_OPTIONS: ReadonlyArray<{ value: TestAnswerFormat; label: string }> = [
  { value: "UPLOAD_ONLY", label: "Upload only (PDF or photos)" },
  { value: "TYPED_ONLY", label: "Typed answers only" },
  { value: "BOTH", label: "Upload or typed" },
];
export const ANSWER_FORMAT_LABEL: Record<TestAnswerFormat, string> = { UPLOAD_ONLY: "Upload only", TYPED_ONLY: "Typed only", BOTH: "Upload or typed" };

/** Status badge: text and AA-contrast colours. */
export const STATUS_BADGE: Record<TestStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-amber-100 text-amber-900" },
  PUBLISHED: { label: "Published", className: "bg-emerald-100 text-emerald-900" },
};

const PROBLEM_TEXT: Record<string, string> = {
  NO_PAPER_OR_QUESTIONS: "The test has no question paper and no questions. Add a paper (Files tab) or at least one question (Questions tab).",
  QUESTION_MARKS_MISMATCH: "The questions' marks don't add up to the test's maximum. Change the questions' marks or the maximum (Details tab) so they match.",
  ALREADY_CLOSED: "The closing time has already passed, so students could no longer answer. Open the Details tab, move the closing time later, save, then publish.",
};
/** A refusal to publish (409 TEST_NOT_READY problems) in plain words, with what to do. `closesAt` names the time that passed. */
export function publishProblemText(code: string, ctx: { closesAt?: string; formatTime?: (iso: string) => string } = {}): string {
  if (code === "ALREADY_CLOSED" && ctx.closesAt && ctx.formatTime) {
    return `The closing time (${ctx.formatTime(ctx.closesAt)}) has already passed, so students could no longer answer. Open the Details tab, move the closing time later, save, then publish.`;
  }
  return PROBLEM_TEXT[code] ?? "This test isn't ready to be published yet. Check its details, questions and files.";
}
/** Problems the page can see before asking the server (the server checks again). */
export function knownPublishProblems(t: { closesAt: string }, now = new Date()): string[] {
  return new Date(t.closesAt).getTime() <= now.getTime() ? ["ALREADY_CLOSED"] : [];
}

// ── Dates (the browser's local time in the form; ISO for the API) ─────────────

/** `datetime-local` value ("2026-12-01T09:30") from an ISO time, in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO time from a `datetime-local` value, or null when it is empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── The details form ──────────────────────────────────────────────────────────

export interface DetailsDraft {
  title: string;
  subjectId: string;
  division: TestDivision | "";
  answerFormat: TestAnswerFormat | "";
  opensAt: string;   // datetime-local
  closesAt: string;  // datetime-local
  maxMarks: string;
}

export type DetailsField = keyof DetailsDraft;

export const EMPTY_DETAILS: DetailsDraft = { title: "", subjectId: "", division: "ALL", answerFormat: "", opensAt: "", closesAt: "", maxMarks: "" };

const WHOLE = /^\d+$/;

/** A whole number of marks from 1 to MAX_TEST_MARKS (G7), or null. */
export function parseMarks(value: string): number | null {
  const v = value.trim();
  if (!WHOLE.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= MAX_TEST_MARKS ? n : null;
}

/** Field errors of the details (the backend's rules); empty when the details can be sent. */
export function detailsProblems(d: DetailsDraft): Partial<Record<DetailsField, string>> {
  const e: Partial<Record<DetailsField, string>> = {};
  const title = d.title.trim();
  if (title.length < 3 || title.length > 200) e.title = "Enter a title of 3–200 characters.";
  if (!d.subjectId) e.subjectId = "Choose the subject.";
  if (!d.division) e.division = "Choose who the test is for.";
  if (!d.answerFormat) e.answerFormat = "Choose how students answer.";
  const opens = fromLocalInput(d.opensAt);
  const closes = fromLocalInput(d.closesAt);
  if (!opens) e.opensAt = "Enter when the test opens.";
  if (!closes) e.closesAt = "Enter when the test closes.";
  if (opens && closes && new Date(opens).getTime() >= new Date(closes).getTime()) e.closesAt = "The test must close after it opens.";
  if (parseMarks(d.maxMarks) === null) e.maxMarks = `Enter a whole number of marks from 1 to ${MAX_TEST_MARKS}.`;
  return e;
}

/** The API body of valid details. */
export function detailsBody(d: DetailsDraft): TestDetailsInput {
  return {
    title: d.title.trim(), subjectId: d.subjectId, division: d.division as TestDivision, answerFormat: d.answerFormat as TestAnswerFormat,
    opensAt: fromLocalInput(d.opensAt)!, closesAt: fromLocalInput(d.closesAt)!, maxMarks: parseMarks(d.maxMarks)!,
  };
}

export function detailsDraftOf(t: TestSummary): DetailsDraft {
  return {
    title: t.title, subjectId: t.subject.id, division: t.division, answerFormat: t.answerFormat,
    opensAt: toLocalInput(t.opensAt), closesAt: toLocalInput(t.closesAt), maxMarks: String(t.maxMarks),
  };
}

/** Only what changed (PATCH); empty when nothing did. Times compare by the minute shown in the form. */
export function detailsChange(t: TestSummary, d: DetailsDraft): Partial<TestDetailsInput> {
  const body = detailsBody(d);
  const before = detailsDraftOf(t);
  const out: Partial<TestDetailsInput> = {};
  if (body.title !== t.title) out.title = body.title;
  if (body.subjectId !== t.subject.id) out.subjectId = body.subjectId;
  if (body.division !== t.division) out.division = body.division;
  if (body.answerFormat !== t.answerFormat) out.answerFormat = body.answerFormat;
  if (d.opensAt !== before.opensAt) out.opensAt = body.opensAt;
  if (d.closesAt !== before.closesAt) out.closesAt = body.closesAt;
  if (body.maxMarks !== t.maxMarks) out.maxMarks = body.maxMarks;
  return out;
}

// ── Questions and the sum rule ────────────────────────────────────────────────

export interface QuestionSum {
  total: number;
  remaining: number;
  /** No questions (one total mark), or exactly the maximum. */
  complete: boolean;
  over: boolean;
}

export function questionSum(maxMarks: number, marks: readonly number[]): QuestionSum {
  const total = marks.reduce((a, b) => a + b, 0);
  return { total, remaining: maxMarks - total, complete: marks.length === 0 || total === maxMarks, over: total > maxMarks };
}

/** "12 of 20 marks — 8 left to distribute" and the like. */
export function sumText(maxMarks: number, marks: readonly number[]): string {
  if (marks.length === 0) return `No questions: marked as one total out of ${maxMarks}.`;
  const s = questionSum(maxMarks, marks);
  if (s.over) return `Questions total ${s.total} of ${maxMarks} marks — ${-s.remaining} too many.`;
  if (s.complete) return `Questions total ${s.total} of ${maxMarks} marks.`;
  return `Questions total ${s.total} of ${maxMarks} marks — ${s.remaining} left to distribute.`;
}

export interface QuestionDraft {
  prompt: string;
  maxMarks: string;
}

/** A question's errors; `othersTotal` is the marks of the test's other questions (never above the maximum). */
export function questionProblems(q: QuestionDraft, maxMarks: number, othersTotal: number): Partial<Record<keyof QuestionDraft, string>> {
  const e: Partial<Record<keyof QuestionDraft, string>> = {};
  const prompt = q.prompt.trim();
  if (prompt.length < 1 || prompt.length > 5000) e.prompt = "Enter the question (up to 5,000 characters).";
  const marks = parseMarks(q.maxMarks);
  if (marks === null) e.maxMarks = "Enter a whole number of marks (at least 1).";
  else if (othersTotal + marks > maxMarks) e.maxMarks = `At most ${Math.max(maxMarks - othersTotal, 0)} marks are left of the test's ${maxMarks}.`;
  return e;
}

export function questionBody(q: QuestionDraft): QuestionInput {
  return { prompt: q.prompt.trim(), maxMarks: parseMarks(q.maxMarks)! };
}

/** The ids with the one at `index` moved one place up (-1) or down (+1); unchanged at the ends. */
export function moveItem<T>(items: readonly T[], index: number, dir: -1 | 1): T[] {
  const to = index + dir;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return [...items];
  const out = [...items];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** Revoking an authorisation needs a reason of 3–500 characters (the backend's rule). */
export const REVOKE_REASON = { label: "Reason", required: true, min: 3, max: 500, placeholder: "Why is this coach no longer authorised?" } as const;
