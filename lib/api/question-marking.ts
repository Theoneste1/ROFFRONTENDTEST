/**
 * Question-level marking (capability `questionMarking`; design Rev 5.2, owner approval 2026-11-26). A test is marked
 * either by PAPER (lib/api/test-marking.ts, unchanged) or by QUESTION: every student's answer to every question is a
 * task; a coach authorised for a question takes one at a time (blind: the paper code and the question, never a name),
 * holds it for 30 minutes (kept alive by a heartbeat while the page is open), and submits it. At most 3 at once. Different
 * questions of one paper can be marked by different coaches at the same time; one question of one paper by one coach.
 *
 *   Coaches (tests.mark)
 *     GET  /marking/tasks?view&testId&question             TO_MARK | MINE | RETURNED | SUBMITTED | ALL; counts per view
 *     POST /marking/tasks/:code/:ref/claim                 409 TASK_TAKEN, CLAIM_LIMIT, TASK_NOT_AVAILABLE, RESUBMISSION_PENDING
 *     GET  /marking/tasks/:code/:ref                       the question, the whole answer (pages), my assessment
 *     GET  …/pages/:n | …/paper | …/marking-guide          neutral names
 *     POST …/heartbeat                                     every heartbeatSeconds while visible; 409 CLAIM_LOST { reason }
 *     PUT  …/marks { marks, comment, expectedRevision }    a draft; 409 MARKING_CHANGED, CLAIM_LOST
 *     POST …/submit { marks, comment, expectedRevision }   this question only; 400 MARKS_INCOMPLETE
 *     POST …/release                                       give it back (the next coach starts empty)
 *   Staff (the subject's Head Coach, Administrators, Super Administrators)
 *     GET   /admin/tests/:id/question-marking               mode, locked once marking started
 *     PATCH …/mode { mode }                                 tests.manage
 *     GET   …/markers · PUT …/questions/:qid/markers         tests.distribute: coaches per question
 *     POST  …/tasks/generate                                tests.distribute
 *     GET   …/tasks · …/tasks/:taskId · …/progress · …/history
 *     POST  …/tasks/:taskId/approve | return | review-hold | second-assessment | cancel-second | reopen | assign | release
 *     POST  …/tasks/:taskId/decide                          tests.adjustMarks: the subject's Head Coach only (G4)
 *     POST  …/questions/:qid/wording-correction · …/structure-correction   Super Administrators, with a reason
 */
import { api, apiBlob, type DownloadedFile } from "./client";
import type { Page } from "./types";

export type MarkingMode = "PAPER" | "QUESTION";
export type CoachView = "TO_MARK" | "MINE" | "RETURNED" | "SUBMITTED" | "ALL";
export type CoachTaskState = "MINE" | "RETURNED_TO_ME" | "AVAILABLE" | "TAKEN" | "SUBMITTED_BY_ME";
export type TaskRound = "FIRST" | "SECOND";
export type TaskStatus =
  | "NOT_STARTED" | "IN_PROGRESS" | "SUBMITTED" | "UNDER_REVIEW" | "RETURNED" | "AWAITING_SECOND" | "APPROVED" | "CLOSED" | "CANCELLED";
export type AssessmentStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "SUPERSEDED" | "ABANDONED";
/** Why a coach's hold ended (409 CLAIM_LOST and the read-only notice). */
export type LostReason = "EXPIRED" | "RELEASED" | "RELEASED_BY_STAFF" | "REASSIGNED" | "AUTHORISATION_LOST" | "CANCELLED" | "SUBMITTED";
export type DecisionSource = "FIRST" | "SECOND" | "ADJUSTED";

export interface Person { id: string; firstName: string; lastName: string; username?: string }

// ── Coaches ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CoachTask {
  /** The question reference: `q2` (first marking), `q2-s1` (a second assessment, cycle 1). */
  ref: string;
  /** The paper's code (blind). */
  code: string;
  question: { order: number; maxMarks: number };
  round: TaskRound;
  cycle: number;
  test: { id: string; title: string; subject: string };
  state: CoachTaskState;
  /** MINE only: when my hold ends unless renewed. */
  lockExpiresAt: string | null;
}

export interface CoachQueue extends Page<CoachTask> {
  counts: Record<CoachView, number>;
  view: CoachView;
  tests: Array<{ id: string; title: string; subject: string }>;
  heartbeatSeconds: number;
}

export interface AnswerPageInfo { pageNumber: number; name: string; mimeType: string; size: number }

export interface CoachTaskDetail {
  ref: string;
  code: string;
  round: TaskRound;
  cycle: number;
  status: TaskStatus;
  test: { id: string; title: string; subject: string; questionCount: number; hasPaper: boolean; hasMarkingGuide: boolean };
  question: { order: number; prompt: string; maxMarks: number; promptVersion: number };
  answer: { typedAnswer: string | null; pages: AnswerPageInfo[] };
  myAssessment: {
    status: AssessmentStatus; marks: number | null; comment: string | null; revision: number; version: number;
    savedAt: string; promptVersion: number;
  } | null;
  returnReason: string | null;
  /** I hold it now and my assessment is a draft (or returned to me). */
  canEdit: boolean;
  lockExpiresAt: string | null;
  heartbeatSeconds: number;
  /** The question's wording was corrected after this assessment began. */
  wordingChanged: boolean;
  claim?: { method: string; lockExpiresAt: string; resumed: boolean };
}

export interface MarksBody { marks?: number | null; comment?: string | null; expectedRevision?: number }

// ── Staff ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface QmOverview {
  test: { id: string; title: string; subject: string; markingMode: MarkingMode; questions: number; papers: number };
  /** Marking has started (paper-level or question-level): the mode can no longer change. */
  modeLocked: boolean;
  enabled: boolean;
}

export interface QmMarkers {
  test: { id: string; title: string; subject: string };
  questions: Array<{ id: string; order: number; maxMarks: number; coaches: Array<Person & { since: string }>; unassigned: boolean }>;
  /** Coaches who may mark the subject (active, authorised). */
  candidates: Person[];
}

export interface GenerateResult {
  created: number;
  papers: number;
  questions: number;
  skipped: Array<{ code: string; reason: "NO_ANSWER" | "DEADLINE_NOT_PASSED" | "RESUBMISSION_PENDING" }>;
}

export interface StaffTaskRow {
  id: string;
  round: TaskRound;
  cycle: number;
  currentCycle: number;
  status: TaskStatus;
  lockExpiresAt: string | null;
  needsReassignment: boolean;
  updatedAt: string;
  question: { order: number; maxMarks: number };
  submission: { id: string; publicCode: string; student: Person };
  holder: Person | null;
  reservedFor: Person | null;
  finalMarks: number | null;
  decisionSource: DecisionSource | null;
  submitted: { marks: number | null; lastVersion: number; marker: Person } | null;
}

export interface AllowedActions {
  approve: boolean; return: boolean; requestSecond: boolean; cancelSecond: boolean; returnSecond: boolean;
  decide: boolean; reopen: boolean; assign: boolean; release: boolean;
}

export interface StaffTaskDetail {
  task: {
    id: string; round: TaskRound; cycle: number; currentCycle: number; status: TaskStatus; lockExpiresAt: string | null;
    needsReassignment: boolean; reviewHoldUntil: string | null; versionId: string;
    question: { id: string; order: number; prompt: string; maxMarks: number; promptVersion: number };
    submission: {
      id: string; publicCode: string; status: string; student: Person;
      currentVersion: { typedAnswer: string | null; pages: Array<{ pageNumber: number; file: { mimeType: string } }> } | null;
    };
    holder: Person | null;
    reservedFor: Person | null;
  };
  tasks: Array<{ id: string; round: TaskRound; cycle: number; status: TaskStatus; holder: Person | null; lockExpiresAt: string | null }>;
  currentSecond: { id: string; round: TaskRound; cycle: number; status: TaskStatus; holder: Person | null } | null;
  decisions: Array<{
    id: string; cycle: number; source: DecisionSource; marks: number; reason: string | null; decidedAt: string;
    supersededAt: string | null; supersedeReason: string | null; decidedBy: Person & { role: string };
  }>;
  assessments: Array<{
    id: string; taskId: string; status: AssessmentStatus; marks: number | null; comment: string | null; revision: number;
    lastVersion: number; promptVersion: number; createdAt: string; updatedAt: string; marker: Person;
    versions: Array<{ id: string; version: number; marks: number; comment: string | null; submittedAt: string }>;
  }>;
  claims: Array<{ id: string; taskId: string; method: string; claimedAt: string; lastActiveAt: string | null; endedAt: string | null; endReason: LostReason | null; coach: Person }>;
  events: Array<{ id: string; taskId: string; action: string; fromStatus: string | null; toStatus: string | null; cycle: number | null; actorRole: string; reason: string | null; createdAt: string; actor: Person | null }>;
  allowed: AllowedActions;
}

export interface QmProgress {
  papers: { total: number; fullyApproved: number } & Record<string, number>;
  tasks: { total: number; byStatus: Record<string, number>; second: Record<string, number> };
  questions: Array<{ order: number; maxMarks: number; coaches: number; unassigned: boolean; byStatus: Record<string, number> }>;
  needsReassignment: number;
  expiredClaims: number;
  coaches: Array<{ id: string; firstName: string; lastName: string; holding: number; submitted: number; approved: number }>;
}

/** The status a review action expects, and the cycle the reviewer saw (409 TASK_CHANGED when someone was faster). */
export interface ReviewGuard { expectedStatus?: TaskStatus; cycleSeen?: number }

const enc = encodeURIComponent;
const T = (code: string, ref: string) => `/marking/tasks/${enc(code)}/${enc(ref)}`;
const Q = (testId: string) => `/admin/tests/${enc(testId)}/question-marking`;
const K = (testId: string, taskId: string) => `${Q(testId)}/tasks/${enc(taskId)}`;

export const coachQmApi = {
  queue: (f: { view?: CoachView; testId?: string; question?: number; page?: number; limit?: number } = {}) =>
    api<CoachQueue>("/marking/tasks", { query: { ...f } }),
  claim: (code: string, ref: string) => api<CoachTaskDetail>(`${T(code, ref)}/claim`, { method: "POST" }),
  get: (code: string, ref: string) => api<CoachTaskDetail>(T(code, ref)),
  page: (code: string, ref: string, page: number): Promise<DownloadedFile> => apiBlob(`${T(code, ref)}/pages/${page}`, {}, `page-${page}`),
  paper: (code: string, ref: string): Promise<DownloadedFile> => apiBlob(`${T(code, ref)}/paper`, {}, "test-paper"),
  markingGuide: (code: string, ref: string): Promise<DownloadedFile> => apiBlob(`${T(code, ref)}/marking-guide`, {}, "marking-guide"),
  heartbeat: (code: string, ref: string) => api<{ lockExpiresAt: string; heartbeatSeconds: number; wordingChanged: boolean }>(`${T(code, ref)}/heartbeat`, { method: "POST" }),
  save: (code: string, ref: string, body: MarksBody) => api<CoachTaskDetail>(`${T(code, ref)}/marks`, { method: "PUT", body }),
  submit: (code: string, ref: string, body: MarksBody) => api<CoachTaskDetail>(`${T(code, ref)}/submit`, { method: "POST", body }),
  release: (code: string, ref: string) => api<{ released: true }>(`${T(code, ref)}/release`, { method: "POST" }),
};

export const staffQmApi = {
  overview: (testId: string) => api<QmOverview>(Q(testId)),
  setMode: (testId: string, mode: MarkingMode) => api<QmOverview>(`${Q(testId)}/mode`, { method: "PATCH", body: { mode } }),
  markers: (testId: string) => api<QmMarkers>(`${Q(testId)}/markers`),
  setMarkers: (testId: string, questionId: string, body: { add?: string[]; remove?: string[]; reason?: string }) =>
    api<QmMarkers>(`${Q(testId)}/questions/${enc(questionId)}/markers`, { method: "PUT", body }),
  generate: (testId: string) => api<GenerateResult>(`${Q(testId)}/tasks/generate`, { method: "POST" }),
  tasks: (testId: string, f: { question?: number; status?: TaskStatus; coachId?: string; code?: string; round?: TaskRound; page?: number; limit?: number } = {}) =>
    api<Page<StaffTaskRow>>(`${Q(testId)}/tasks`, { query: { ...f } }),
  task: (testId: string, taskId: string) => api<StaffTaskDetail>(K(testId, taskId)),
  page: (testId: string, submissionId: string, page: number): Promise<DownloadedFile> =>
    apiBlob(`${Q(testId)}/papers/${enc(submissionId)}/pages/${page}`, {}, `page-${page}`),
  progress: (testId: string) => api<QmProgress>(`${Q(testId)}/progress`),
  history: (testId: string, f: { taskId?: string; page?: number; limit?: number } = {}) =>
    api<Page<StaffTaskDetail["events"][number] & { task?: unknown }>>(`${Q(testId)}/history`, { query: { ...f } }),
  assign: (testId: string, taskId: string, body: { coachId: string; reason: string }) => api<unknown>(`${K(testId, taskId)}/assign`, { method: "POST", body }),
  release: (testId: string, taskId: string, body: { reason: string }) => api<unknown>(`${K(testId, taskId)}/release`, { method: "POST", body }),
  reviewHold: (testId: string, taskId: string) => api<unknown>(`${K(testId, taskId)}/review-hold`, { method: "POST" }),
  approve: (testId: string, taskId: string, body: ReviewGuard = {}) => api<unknown>(`${K(testId, taskId)}/approve`, { method: "POST", body }),
  returnTask: (testId: string, taskId: string, body: ReviewGuard & { reason: string }) => api<unknown>(`${K(testId, taskId)}/return`, { method: "POST", body }),
  requestSecond: (testId: string, taskId: string, body: { coachId?: string; reason?: string; cycleSeen?: number }) =>
    api<unknown>(`${K(testId, taskId)}/second-assessment`, { method: "POST", body }),
  cancelSecond: (testId: string, taskId: string, body: { reason: string }) => api<unknown>(`${K(testId, taskId)}/cancel-second`, { method: "POST", body }),
  decide: (testId: string, taskId: string, body: { source: DecisionSource; marks?: number; reason: string; cycleSeen?: number }) =>
    api<unknown>(`${K(testId, taskId)}/decide`, { method: "POST", body }),
  reopen: (testId: string, taskId: string, body: { reason: string; to: "RETURNED" | "SUBMITTED" }) => api<unknown>(`${K(testId, taskId)}/reopen`, { method: "POST", body }),
  correctWording: (testId: string, questionId: string, body: { prompt: string; reason: string }) =>
    api<unknown>(`${Q(testId)}/questions/${enc(questionId)}/wording-correction`, { method: "POST", body }),
  correctStructure: (testId: string, body: { maxMarks?: number; questions: Array<{ id: string; order: number; maxMarks: number }>; reason: string }) =>
    api<unknown>(`${Q(testId)}/structure-correction`, { method: "POST", body }),
};
