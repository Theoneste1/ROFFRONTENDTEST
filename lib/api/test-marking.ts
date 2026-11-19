/**
 * Test Management, Phase 3 (capability `testMarking`; owner-approved plan 2026-11-19): distribution to markers, blind
 * marking, second marking, review, approval, locking, the mark-change log. The backend enforces every rule (who may do
 * what, the transition table, G5 "only after the latest deadline", the maxima, blindness); the screens only show and send.
 *
 *   Administrators, Head Coaches (their subjects)
 *     GET    /admin/tests/:id/marking                                 tests.distribute: counts, distributable / waiting, coaches' progress
 *     POST   /admin/tests/:id/marking/distribute                      { coachIds, clientKey? } — even
 *     POST   /admin/tests/:id/marking/assign                          { submissionIds, coachId, reason? }
 *     POST   /admin/tests/:id/marking/submissions/:sid/reassign       { coachId, reason, kind? }
 *     GET    /admin/tests/:id/marking/submissions?status&coachId&q    tests.review: identity, markers, marks
 *     GET    /admin/tests/:id/marking/submissions/:sid                every marking side by side, history
 *     POST   …/approve | …/return { comment } | …/second-marking { coachId } | …/unlock { reason }
 *     POST   …/choose { source, reason, marks? }                      tests.adjustMarks: the subject's Head Coach only (G4)
 *     GET    /admin/tests/:id/marking/history?type=status|marks|reviews&submissionId
 *   Coaches (tests.mark: authorised subjects, assigned submissions — BLIND: a code, never a name)
 *     GET    /marking/queue?state&testId
 *     GET    /marking/submissions/:code                                the test, the answer, my marking
 *     GET    /marking/submissions/:code/pages/:n | /paper | /marking-guide   neutral names
 *     PUT    /marking/submissions/:code/marking                        a draft
 *     POST   /marking/submissions/:code/marking/submit                 for approval
 */
import { api, apiBlob, type DownloadedFile } from "./client";
import type { TestPerson, TestQuestion, TestSubject } from "./tests";
import type { AnswerPage, SubmissionStatus } from "./test-submissions";
import type { Page } from "./types";

export type MarkingKind = "FIRST" | "SECOND" | "ADJUSTMENT";
export type MarkingStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
export type QueueState = "NOT_STARTED" | "IN_PROGRESS" | "MARKED";
export type ReviewAction = "APPROVED" | "RETURNED" | "SECOND_MARKING_REQUESTED" | "MARK_CHOSEN" | "UNLOCKED";
export type HistoryType = "status" | "marks" | "reviews";

export interface ScoreValue { questionId: string; marks: number | null; comment: string | null }
export interface MarksBody { scores?: Array<{ questionId: string; marks: number | null; comment?: string | null }>; totalMarks?: number | null; comment?: string | null }

// ── Staff ──────────────────────────────────────────────────────────────────────

export interface CoachProgress {
  coach: TestPerson;
  /** Holds an active authorisation for the subject (an account that lost it keeps its assignments until reassigned). */
  authorised: boolean;
  assigned: number;
  notStarted: number;
  inProgress: number;
  marked: number;
  firstMarkings: number;
  secondMarkings: number;
}

export interface MarkingOverview {
  test: { id: string; title: string; status: string; maxMarks: number; closesAt: string; subject: TestSubject };
  now: string;
  counts: { total: number; byStatus: Partial<Record<SubmissionStatus, number>> };
  distribution: { readyToAssign: number; waitingForDeadline: number; nextEligibleAt: string | null };
  coaches: CoachProgress[];
}

export interface DistributionResult {
  assigned: number;
  waitingForDeadline: number;
  coaches: Array<{ coachId: string; assigned: number; total: number }>;
}

export interface ReviewRow {
  id: string;
  publicCode: string;
  status: SubmissionStatus;
  updatedAt: string;
  student: TestPerson & { gradeLevel: string | null; school: { id: string; name: string } | null };
  firstMarker: TestPerson | null;
  secondMarker: TestPerson | null;
  first: { status: MarkingStatus; totalMarks: number | null } | null;
  second: { status: MarkingStatus; totalMarks: number | null } | null;
  final: { kind: MarkingKind; totalMarks: number | null } | null;
  /** SUBMITTED only: may be assigned now (G5), and from when. */
  markable: boolean | null;
  markableAfter: string | null;
}

export interface ReviewPage extends Page<ReviewRow> {
  counts: Partial<Record<SubmissionStatus, number>>;
}

export interface StaffMarking {
  id: string;
  kind: MarkingKind;
  status: MarkingStatus;
  totalMarks: number | null;
  comment: string | null;
  revision: number;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignmentId: string | null;
  versionId: string;
  marker: TestPerson;
  scores: ScoreValue[];
  final: boolean;
}

export interface StaffAssignment {
  id: string;
  kind: "FIRST" | "SECOND";
  method: "DISTRIBUTION" | "MANUAL" | "REASSIGNMENT" | "SECOND_MARKING";
  reason: string | null;
  assignedAt: string;
  endedAt: string | null;
  endReason: string | null;
  coach: TestPerson;
  assignedBy: TestPerson | null;
  endedBy: TestPerson | null;
  current: boolean;
}

export interface ReviewRecord {
  id: string;
  action: ReviewAction;
  chosenKind: MarkingKind | null;
  comment: string | null;
  fromStatus: SubmissionStatus;
  toStatus: SubmissionStatus;
  actorRole: string;
  createdAt: string;
  markingId: string | null;
  actor: TestPerson | null;
}

export interface StatusChange {
  fromStatus: SubmissionStatus | null;
  toStatus: SubmissionStatus;
  actorRole: string;
  reason: string | null;
  createdAt: string;
  actor: TestPerson | null;
}

export interface MarkChange {
  id: string;
  markingId: string;
  questionId: string | null;
  oldMarks: number | null;
  newMarks: number | null;
  changedByRole: string;
  reason: string | null;
  createdAt: string;
  changedBy: TestPerson | null;
}

export interface ReviewActions {
  approve: boolean;
  return: boolean;
  requestSecondMarking: boolean;
  choose: boolean;
  unlock: boolean;
  reassignFirst: boolean;
  reassignSecond: boolean;
}

export interface ReviewDetail {
  id: string;
  publicCode: string;
  status: SubmissionStatus;
  finalMarkingId: string | null;
  updatedAt: string;
  student: ReviewRow["student"];
  test: { id: string; title: string; maxMarks: number; subject: TestSubject; questions: TestQuestion[] };
  answer: { versionId: string; version: number; versionCount: number; typedAnswer: string | null; pages: AnswerPage[] } | null;
  markings: StaffMarking[];
  assignments: StaffAssignment[];
  reviews: ReviewRecord[];
  statusHistory: StatusChange[];
  markChanges: MarkChange[];
  actions: ReviewActions;
  replayed?: boolean;
}

export interface HistoryStatusRow extends StatusChange { id: string; submission: HistorySubmission }
export interface HistoryMarkRow {
  id: string; oldMarks: number | null; newMarks: number | null; changedByRole: string; reason: string | null; createdAt: string;
  changedBy: TestPerson | null; question: { id: string; order: number; maxMarks: number } | null;
  marking: { id: string; kind: MarkingKind; marker: TestPerson }; submission: HistorySubmission;
}
export interface HistoryReviewRow extends Omit<ReviewRecord, "markingId"> { submission: HistorySubmission }
export interface HistorySubmission { id: string; publicCode: string; student: { id: string; firstName: string; lastName: string } }

// ── The marker (blind) ─────────────────────────────────────────────────────────

export interface QueueItem {
  code: string;
  test: { id: string; title: string; maxMarks: number; subject: { code: string; name: string } };
  state: QueueState;
  returned: boolean;
  myTotal: number | null;
  assignedAt: string;
  savedAt: string | null;
}

export interface QueuePage extends Page<QueueItem> {
  counts: { notStarted: number; inProgress: number; marked: number; total: number };
  tests: Array<{ id: string; title: string; assigned: number; notStarted: number; inProgress: number; marked: number }>;
}

export interface NeutralFile { name: string; mimeType: string; size: number }

export interface MarkerSubmission {
  code: string;
  state: QueueState;
  canEdit: boolean;
  test: {
    id: string; title: string; maxMarks: number; subject: { code: string; name: string };
    questions: TestQuestion[]; paper: NeutralFile | null; markingGuide: NeutralFile | null;
  };
  answer: { typedAnswer: string | null; pages: AnswerPage[] };
  myMarking: {
    status: MarkingStatus; revision: number; totalMarks: number | null; comment: string | null; savedAt: string;
    scores: ScoreValue[]; returnComment: string | null;
  } | null;
  replayed?: boolean;
}

const enc = encodeURIComponent;
const M = (testId: string) => `/admin/tests/${enc(testId)}/marking`;
const S = (testId: string, submissionId: string) => `${M(testId)}/submissions/${enc(submissionId)}`;
const C = (code: string) => `/marking/submissions/${enc(code)}`;

export const testMarkingApi = {
  overview: (testId: string) => api<MarkingOverview>(M(testId)),
  distribute: (testId: string, body: { coachIds: string[]; clientKey?: string }) =>
    api<DistributionResult>(`${M(testId)}/distribute`, { method: "POST", body }),
  assign: (testId: string, body: { submissionIds: string[]; coachId: string; reason?: string }) =>
    api<{ assigned: number; alreadyAssigned: number }>(`${M(testId)}/assign`, { method: "POST", body }),
  reassign: (testId: string, submissionId: string, body: { coachId: string; reason: string; kind?: "FIRST" | "SECOND" }) =>
    api<ReviewDetail>(`${S(testId, submissionId)}/reassign`, { method: "POST", body }),
  list: (testId: string, f: { status?: SubmissionStatus; coachId?: string; q?: string; page?: number; limit?: number } = {}) =>
    api<ReviewPage>(`${M(testId)}/submissions`, { query: { ...f } }),
  get: (testId: string, submissionId: string) => api<ReviewDetail>(S(testId, submissionId)),
  approve: (testId: string, submissionId: string, body: { clientKey?: string; expectedStatus?: SubmissionStatus } = {}) =>
    api<ReviewDetail>(`${S(testId, submissionId)}/approve`, { method: "POST", body }),
  returnForCorrection: (testId: string, submissionId: string, body: { comment: string; kind?: "FIRST" | "SECOND"; clientKey?: string; expectedStatus?: SubmissionStatus }) =>
    api<ReviewDetail>(`${S(testId, submissionId)}/return`, { method: "POST", body }),
  requestSecondMarking: (testId: string, submissionId: string, body: { coachId: string; reason?: string; clientKey?: string; expectedStatus?: SubmissionStatus }) =>
    api<ReviewDetail>(`${S(testId, submissionId)}/second-marking`, { method: "POST", body }),
  choose: (testId: string, submissionId: string, body: { source: MarkingKind; reason: string; marks?: MarksBody; clientKey?: string; expectedStatus?: SubmissionStatus }) =>
    api<ReviewDetail>(`${S(testId, submissionId)}/choose`, { method: "POST", body }),
  unlock: (testId: string, submissionId: string, body: { reason: string; clientKey?: string; expectedStatus?: SubmissionStatus }) =>
    api<ReviewDetail>(`${S(testId, submissionId)}/unlock`, { method: "POST", body }),
  history: <T = HistoryStatusRow | HistoryMarkRow | HistoryReviewRow>(testId: string, f: { type?: HistoryType; submissionId?: string; page?: number; limit?: number } = {}) =>
    api<Page<T>>(`${M(testId)}/history`, { query: { ...f } }),
};

export const markerApi = {
  queue: (f: { state?: QueueState; testId?: string; page?: number; limit?: number } = {}) => api<QueuePage>("/marking/queue", { query: { ...f } }),
  get: (code: string) => api<MarkerSubmission>(C(code)),
  page: (code: string, page: number): Promise<DownloadedFile> => apiBlob(`${C(code)}/pages/${page}`, {}, `page-${page}`),
  paper: (code: string): Promise<DownloadedFile> => apiBlob(`${C(code)}/paper`, {}, "test-paper"),
  markingGuide: (code: string): Promise<DownloadedFile> => apiBlob(`${C(code)}/marking-guide`, {}, "marking-guide"),
  save: (code: string, body: MarksBody & { expectedRevision?: number }) => api<MarkerSubmission>(`${C(code)}/marking`, { method: "PUT", body }),
  submit: (code: string, body: MarksBody) => api<MarkerSubmission>(`${C(code)}/marking/submit`, { method: "POST", body }),
};
