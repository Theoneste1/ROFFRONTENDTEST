/**
 * Test Management, Phase 2 (capability `testSubmissions`): the pure rules of the answer, tracking and extension screens —
 * when the menus and pages show, labels, what an answer format allows, the page-by-page upload queue (one page at a
 * time; a failed page is retried on its own), and the extension form's checks. Unit-tested in
 * tests/test-submissions.test.mjs. The backend remains the authority: it computes every deadline from database time and
 * enforces every rule (the browser's clock never decides anything).
 */
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { TestAnswerFormat } from "../api/tests";
import type { AnswerWindow, ExtensionKind, ExtensionState, SubmissionStatus, SubmitterRole, TrackingFilter, TrackingState } from "../api/test-submissions";

export const TESTS_SUBMIT: Permission = "tests.submit";
export const TESTS_SUBMIT_FOR_STUDENTS: Permission = "tests.submitForStudents";
export const TESTS_EXTENSIONS: Permission = "tests.extensions";
export const TESTS_VIEW_SUBMISSIONS: Permission = "tests.viewSubmissions";
/** Allow one more version of a locked answer (Administrators; owner 2026-11-21). */
export const TESTS_AUTHORIZE_RESUBMISSION: Permission = "tests.authorizeResubmission";

/** Answer pages: PDF or images (phone photos included), at most 20 MB each, at most 30 per version (the backend's rules). */
export const ANSWER_PAGE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif";
export const ANSWER_PAGE_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_ANSWER_PAGES = 30;
export const MAX_TYPED_ANSWER = 50_000;

export function testSubmissionsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "testSubmissions");
}

/** A portal's Tests menu item: a backend with `testSubmissions` AND the known permission (students / teachers). */
export function answerNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null, permission: Permission): boolean {
  return testSubmissionsSupported(detection) && !!permissions && permissions.has(permission);
}

export type AnswerPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

export function answerPageMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
  permission: Permission;
}): AnswerPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!testSubmissionsSupported(opts.detection)) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(opts.permission) ? "visible" : "forbidden";
}

/** The staff tabs (Submissions, Extensions): the backend feature and the permission (known, or unknown after an error). */
export function staffTabVisible(detection: BackendDetection | undefined, allowed: boolean): boolean {
  return testSubmissionsSupported(detection) && allowed;
}

// ── Labels and badges (AA contrast) ─────────────────────────────────────────────

export const WINDOW_BADGE: Record<AnswerWindow, { label: string; className: string }> = {
  UPCOMING: { label: "Not open yet", className: "bg-slate-200 text-slate-800" },
  OPEN: { label: "Open", className: "bg-emerald-100 text-emerald-900" },
  CLOSED: { label: "Closed", className: "bg-rose-100 text-rose-900" },
};

export const TRACKING_BADGE: Record<TrackingState, { label: string; className: string }> = {
  SUBMITTED: { label: "Submitted", className: "bg-emerald-100 text-emerald-900" },
  NOT_SUBMITTED: { label: "Not yet", className: "bg-amber-100 text-amber-900" },
  LATE_BLOCKED: { label: "Late (blocked)", className: "bg-rose-100 text-rose-900" },
};

export const TRACKING_FILTERS: ReadonlyArray<{ label: string; value: "" | TrackingFilter }> = [
  { label: "All", value: "" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Not yet", value: "NOT_SUBMITTED" },
  { label: "Late (blocked)", value: "LATE_BLOCKED" },
  { label: "Under extension", value: "UNDER_EXTENSION" },
];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  SUBMITTED: "Submitted", ASSIGNED: "Assigned", MARKING_IN_PROGRESS: "Marking in progress", MARKED: "Marked (awaiting approval)",
  APPROVED: "Approved", PUBLISHED: "Published", RETURNED: "Returned for correction", AWAITING_SECOND_MARKING: "Awaiting second marking",
};

export const SUBMITTER_LABEL: Record<SubmitterRole, string> = { STUDENT: "Student", TEACHER: "Teacher" };

export const EXTENSION_KIND_LABEL: Record<ExtensionKind, string> = { TEST: "Whole test", STUDENT: "One student", TEACHER: "One teacher" };

export const EXTENSION_STATE_BADGE: Record<ExtensionState, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-900" },
  EXPIRED: { label: "Expired", className: "bg-slate-200 text-slate-800" },
  CANCELLED: { label: "Cancelled", className: "bg-rose-100 text-rose-900" },
};

// ── What an answer format allows ────────────────────────────────────────────────

export function formatAllows(format: TestAnswerFormat): { typed: boolean; upload: boolean } {
  return { typed: format !== "UPLOAD_ONLY", upload: format !== "TYPED_ONLY" };
}

export const FORMAT_HELP: Record<TestAnswerFormat, string> = {
  UPLOAD_ONLY: "Upload your answer: a PDF, or a photo of each page.",
  TYPED_ONLY: "Type your answer below.",
  BOTH: "Type your answer, upload pages (a PDF or a photo of each page), or both.",
};

/** What stops a version from being sent (null: it can be). Mirrors the backend's 400 codes. */
export function answerProblem(format: TestAnswerFormat, typed: string, readyPages: number): string | null {
  const hasTyped = typed.trim().length > 0;
  if (typed.length > MAX_TYPED_ANSWER) return `The typed answer is longer than ${MAX_TYPED_ANSWER.toLocaleString("en-GB")} characters.`;
  if (format === "UPLOAD_ONLY" && readyPages === 0) return "Upload at least one page.";
  if (format === "TYPED_ONLY" && !hasTyped) return "Type your answer.";
  if (format === "BOTH" && !hasTyped && readyPages === 0) return "Type an answer or upload at least one page.";
  return null;
}

// ── The page queue (one page per request; a failed page is retried on its own) ──

export type PageStatus = "queued" | "uploading" | "done" | "failed";

export interface PageItem {
  /** Stable id of the chosen file (the component keeps the File under it). */
  id: string;
  /** 1…n, the order the pages are submitted in. */
  page: number;
  name: string;
  size: number;
  status: PageStatus;
  error?: string;
  /** Automatic attempts made for this upload (a weak connection gets a couple before the Retry button). */
  attempts: number;
}

/** Problem with one chosen file (null: acceptable). */
export function pageFileProblem(file: { name: string; size: number }): string | null {
  const ext = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (!ANSWER_PAGE_ACCEPT.split(",").includes(ext)) return `${file.name}: use a PDF or a photo (JPEG, PNG, WebP, GIF, HEIC).`;
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > ANSWER_PAGE_MAX_BYTES) return `${file.name} is larger than 20 MB.`;
  return null;
}

let seq = 0;
/** Append files as the next pages (queued). Refuses beyond MAX_ANSWER_PAGES. */
export function addPages(items: readonly PageItem[], files: ReadonlyArray<{ name: string; size: number; id?: string }>): { items: PageItem[]; refused: number } {
  const room = Math.max(MAX_ANSWER_PAGES - items.length, 0);
  const take = files.slice(0, room);
  const start = items.length;
  return {
    items: [...items, ...take.map((f, i) => ({ id: f.id ?? `page-file-${++seq}`, page: start + i + 1, name: f.name, size: f.size, status: "queued" as const, attempts: 0 }))],
    refused: files.length - take.length,
  };
}

/**
 * Remove page `page`: the later pages move up one place and must be sent again under their new numbers (a re-sent
 * number replaces the pending page on the server); `deleteOnServer` is the old last number, which no longer exists.
 */
export function removePage(items: readonly PageItem[], page: number): { items: PageItem[]; deleteOnServer: number | null } {
  const target = items.find((x) => x.page === page);
  if (!target) return { items: [...items], deleteOnServer: null };
  const last = items.length;
  // Pages k…n-1 are sent again; the server's page n (if it has one) would be left over.
  const lastItem = items.find((x) => x.page === last);
  const lastOnServer = !!lastItem && (lastItem.status === "done" || lastItem.status === "uploading");
  const out = items.filter((x) => x.page !== page).map((x) =>
    x.page > page ? { ...x, page: x.page - 1, status: "queued" as const, error: undefined, attempts: 0 } : x);
  return { items: out, deleteOnServer: lastOnServer ? last : null };
}

/** The next page to send: the first queued one (one at a time). */
export function nextQueued(items: readonly PageItem[]): PageItem | null {
  return items.find((x) => x.status === "queued") ?? null;
}

export function setPage(items: readonly PageItem[], page: number, patch: Partial<PageItem>): PageItem[] {
  return items.map((x) => (x.page === page ? { ...x, ...patch } : x));
}

/** Retry one failed page (or every failed one with page = null). */
export function retryFailed(items: readonly PageItem[], page: number | null): PageItem[] {
  return items.map((x) => (x.status === "failed" && (page === null || x.page === page) ? { ...x, status: "queued", error: undefined, attempts: 0 } : x));
}

export function queueSummary(items: readonly PageItem[]): { total: number; done: number; failed: number; busy: boolean; ready: boolean } {
  const done = items.filter((x) => x.status === "done").length;
  const failed = items.filter((x) => x.status === "failed").length;
  const busy = items.some((x) => x.status === "uploading" || x.status === "queued");
  return { total: items.length, done, failed, busy, ready: done === items.length };
}

/** A weak connection: network errors and server trouble are retried automatically (twice) before asking the user. */
export const AUTO_RETRIES = 2;
export function shouldAutoRetry(error: { status?: number } | null | undefined, attempts: number): boolean {
  const status = error?.status ?? 0;
  const transient = status === 0 || status === 408 || status === 429 || status >= 500;
  return transient && attempts < AUTO_RETRIES;
}
export const retryDelayMs = (attempts: number) => 1000 * 3 ** attempts;

/** "3 of 5 pages uploaded" and the like. */
export function queueText(items: readonly PageItem[]): string {
  const s = queueSummary(items);
  if (s.total === 0) return "No pages yet.";
  const base = `${s.done} of ${s.total} ${s.total === 1 ? "page" : "pages"} uploaded`;
  return s.failed ? `${base} — ${s.failed} failed: retry ${s.failed === 1 ? "it" : "them"}.` : `${base}.`;
}

/** A fresh client key for one attempt (also the key its pages are uploaded under). */
export function newClientKey(): string {
  return globalThis.crypto.randomUUID();
}

/** Where the current attempt's key is remembered (this tab only), so a reload resumes the uploaded pages. */
export const uploadKeyStorageKey = (testId: string, studentId: string | null) => `rof.testUpload.${testId}.${studentId ?? "me"}`;

// ── Extensions (Administrators, Head Coaches) ───────────────────────────────────

export const EXTENSION_REASON = { label: "Reason", required: true, min: 3, max: 500, placeholder: "Why is this extension given?" } as const;
export const CANCEL_REASON = { label: "Reason", required: true, min: 3, max: 500, placeholder: "Why is this extension cancelled?" } as const;

export interface ExtensionDraft {
  kind: ExtensionKind;
  targetId: string;
  /** datetime-local */
  newDeadline: string;
  reason: string;
}

/**
 * The form's checks (the backend checks again, against its own clock): a target for an individual extension, a deadline
 * after the test's own and in the future, a reason of 3–500 characters. `now` is only a hint for the form.
 */
export function extensionProblems(d: ExtensionDraft, closesAtIso: string, now: number, opts: { editing?: boolean } = {}): Partial<Record<keyof ExtensionDraft, string>> {
  const e: Partial<Record<keyof ExtensionDraft, string>> = {};
  if (!opts.editing && d.kind !== "TEST" && !d.targetId) e.targetId = d.kind === "STUDENT" ? "Choose the student." : "Choose the teacher.";
  const t = d.newDeadline ? new Date(d.newDeadline).getTime() : NaN;
  if (Number.isNaN(t)) e.newDeadline = "Enter the new deadline.";
  else if (t <= new Date(closesAtIso).getTime()) e.newDeadline = "The new deadline must be after the test's own deadline.";
  else if (t <= now) e.newDeadline = "The new deadline must be in the future.";
  const reason = d.reason.trim();
  if (reason.length < 3 || reason.length > 500) e.reason = "Give a reason of 3–500 characters.";
  return e;
}

// ── Locked submissions (owner 2026-11-21, capability testSubmissionLock) ─────────

/** A submitted answer is locked; only an Administrator authorizes one more version. Also: level / subject filters. */
export function submissionLockSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "testSubmissionLock");
}

/** The resubmission reason an Administrator gives (3–500 characters, as the backend checks). */
export function resubmissionReasonProblem(reason: string): string | undefined {
  const r = reason.trim();
  return r.length < 3 || r.length > 500 ? "Give a reason of 3–500 characters." : undefined;
}

/** The action a list offers for one answer: submit, submit again (an Administrator allowed it), or view. */
export function answerActionLabel(canSubmit: boolean, submitted: boolean, lockAware: boolean): "Submit" | "Submit again" | "Replace" | "View" {
  if (!canSubmit) return "View";
  if (!submitted) return "Submit";
  return lockAware ? "Submit again" : "Replace";
}
