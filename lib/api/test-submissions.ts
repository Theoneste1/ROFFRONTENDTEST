/**
 * Test Management, Phase 2 (capability `testSubmissions`; owner-approved plan 2026-11-19): deadlines, extensions,
 * student and teacher submissions with every version, submission tracking. The backend computes every deadline from
 * its database time (extensions included) and enforces every rule; the screens only show and send.
 *
 *   Students (tests.submit, own)
 *     GET    /me/tests?window                                  my tests: deadline (mine), window, submission, canSubmit
 *     GET    /me/tests/:id                                     the test (questions once open), my versions
 *     GET    /me/tests/:id/paper                               the paper (neutral name), once open
 *     GET    /me/tests/:id/uploads/:key                        pending pages of one upload
 *     POST   /me/tests/:id/uploads/:key/pages/:n               ONE page (multipart `file`); the same n replaces it
 *     DELETE /me/tests/:id/uploads/:key/pages/:n               remove a pending page
 *     POST   /me/tests/:id/submission                          { clientKey, typedAnswer?, pageCount? } — idempotent
 *     GET    /me/tests/:id/versions/:versionId/pages/:n        a page of one of my versions
 *   Teachers (tests.submitForStudents: verified students of their own schools, G2)
 *     GET    /teacher/tests?window, /teacher/tests/:id/paper, /teacher/tests/:id/students?status&schoolId&q,
 *            /teacher/tests/:id/students/:studentId and the same upload / submission / page routes under it.
 *   Administrators, Head Coaches (their subjects)
 *     GET    /admin/tests/:id/extensions?state&kind            tests.extensions
 *     GET    /admin/tests/:id/extension-targets?kind&q         tests.extensions
 *     POST   /admin/tests/:id/extensions                       { kind, studentId? | teacherId?, newDeadline, reason }
 *     PATCH  /admin/tests/:id/extensions/:extId                { newDeadline?, reason }
 *     POST   /admin/tests/:id/extensions/:extId/cancel         { reason }
 *     GET    /admin/tests/:id/submissions?status&schoolId&division&q   tests.viewSubmissions (tracking + counts)
 *     GET    /admin/tests/:id/submissions/:submissionId        every version, submitter, extension status
 *     GET    /admin/tests/:id/submissions/:sid/versions/:vid/pages/:n
 */
import { api, apiBlob, type DownloadedFile } from "./client";
import type { TestAnswerFormat, TestDivision, TestPerson, TestSubject } from "./tests";
import type { Page } from "./types";

export type AnswerWindow = "UPCOMING" | "OPEN" | "CLOSED";
export type SubmitterRole = "STUDENT" | "TEACHER";
export type TrackingState = "SUBMITTED" | "NOT_SUBMITTED" | "LATE_BLOCKED";
export type TrackingFilter = TrackingState | "UNDER_EXTENSION";
export type ExtensionKind = "TEST" | "STUDENT" | "TEACHER";
export type ExtensionState = "ACTIVE" | "EXPIRED" | "CANCELLED";
export type SubmissionStatus =
  | "SUBMITTED" | "ASSIGNED" | "MARKING_IN_PROGRESS" | "MARKED" | "APPROVED" | "PUBLISHED" | "RETURNED" | "AWAITING_SECOND_MARKING";

export interface AnswerPage {
  page: number;
  /** Neutral name: page-3.jpg. */
  name: string;
  mimeType: string;
  size: number;
}

/** A version as the student or a teacher sees it (no deadline or extension mark). */
export interface AnswerVersion {
  id: string;
  number: number;
  submittedAt: string;
  submitterRole: SubmitterRole;
  submittedBy: { firstName: string; lastName: string };
  typedAnswer: string | null;
  pageCount: number;
  pages: AnswerPage[];
}

export interface AnswererTest {
  id: string;
  title: string;
  subject: TestSubject;
  division: TestDivision;
  answerFormat: TestAnswerFormat;
  maxMarks: number;
  opensAt: string;
  /** The deadline that applies to this answerer (extension included). */
  deadline: string;
  window: AnswerWindow;
  hasPaper: boolean;
  /** The paper under its neutral name (once the test is open). */
  paper?: { name: string; mimeType: string; size: number } | null;
  questions: Array<{ order: number; prompt: string; maxMarks: number }>;
}

export interface AnswerView {
  test: AnswererTest;
  student: { id: string; username: string; firstName: string; lastName: string; gradeLevel: string | null; school: { id: string; name: string } | null };
  submission: {
    status: SubmissionStatus;
    versionCount: number;
    firstSubmittedAt: string | null;
    lastSubmittedAt: string | null;
    currentVersion: number | null;
    versions: AnswerVersion[];
  } | null;
  canSubmit: boolean;
  limits: { maxPages: number };
  /** On a submission: the same clientKey was already committed (nothing new was created). */
  replayed?: boolean;
}

export interface MyTestRow {
  id: string;
  title: string;
  subject: TestSubject;
  division: TestDivision;
  answerFormat: TestAnswerFormat;
  maxMarks: number;
  opensAt: string;
  deadline: string;
  window: AnswerWindow;
  submission: { status: SubmissionStatus; versionCount: number; lastSubmittedAt: string | null } | null;
  canSubmit: boolean;
}

export interface TeacherTestRow extends Omit<MyTestRow, "submission" | "canSubmit"> {
  /** Verified students of my schools in the test's division. */
  students: number;
  submitted: number;
}

export interface TeacherStudentRow {
  student: { id: string; username: string; firstName: string; lastName: string; gradeLevel: string | null; school: { id: string; name: string } | null };
  /** The deadline when I submit for this student. */
  deadline: string;
  state: TrackingState;
  submission: { status: SubmissionStatus; versionCount: number; lastSubmittedAt: string | null; lastSubmitterRole: SubmitterRole | null } | null;
  canSubmit: boolean;
}

export interface PendingUpload {
  uploadKey: string;
  pages: Array<AnswerPage & { uploadedAt: string }>;
}

// ── Staff (Administrators, Head Coaches) ─────────────────────────────────────────

export interface StaffPerson extends TestPerson {
  role?: string;
}

export interface StaffVersion {
  id: string;
  number: number;
  submittedAt: string;
  submitterRole: SubmitterRole;
  submittedBy: StaffPerson;
  teacher: TestPerson | null;
  applicableDeadline: string;
  underExtension: boolean;
  extensionId: string | null;
  typedAnswer: string | null;
  pageCount: number;
  pages: AnswerPage[];
}

export interface StaffSubmissionSummary {
  id: string;
  publicCode: string;
  status: SubmissionStatus;
  versionCount: number;
  firstSubmittedAt: string | null;
  lastSubmittedAt: string | null;
  current: {
    number: number; submittedAt: string; submitterRole: SubmitterRole; submittedBy: TestPerson; teacher: TestPerson | null; underExtension: boolean;
  } | null;
}

export interface TrackingRow {
  student: { id: string; username: string; firstName: string; lastName: string; gradeLevel: string | null; accountStatus: string; school: { id: string; name: string } | null };
  deadline: string;
  extended: boolean;
  extensionKind: ExtensionKind | null;
  extensionId: string | null;
  state: TrackingState;
  submission: StaffSubmissionSummary | null;
}

export interface TrackingCounts {
  students: number;
  submitted: number;
  notSubmitted: number;
  lateBlocked: number;
  underExtension: number;
  submittedUnderExtension: number;
  submittedByTeacher: number;
}

export interface TrackingPage extends Page<TrackingRow> {
  deadline: { closesAt: string; general: string; extended: boolean };
  counts: TrackingCounts;
}

export interface StaffSubmissionDetail extends StaffSubmissionSummary {
  student: { id: string; username: string; firstName: string; lastName: string; gradeLevel: string | null; school: { id: string; name: string } | null };
  deadline: string;
  extended: boolean;
  extensionKind: ExtensionKind | null;
  extensionId: string | null;
  versions: StaffVersion[];
  statusHistory: Array<{ fromStatus: SubmissionStatus | null; toStatus: SubmissionStatus; actorRole: string; reason: string | null; createdAt: string; actor: TestPerson | null }>;
}

export interface TestExtension {
  id: string;
  testId: string;
  kind: ExtensionKind;
  state: ExtensionState;
  student: (TestPerson & { gradeLevel: string | null; school: { id: string; name: string } | null }) | null;
  teacher: TestPerson | null;
  newDeadline: string;
  reason: string;
  grantedBy: TestPerson | null;
  grantedAt: string;
  editedBy: TestPerson | null;
  editedAt: string | null;
  cancelledBy: TestPerson | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface ExtensionTarget extends TestPerson {
  gradeLevel: string | null;
  school: { id: string; name: string } | null;
  activeExtensionId: string | null;
}

export interface CreateExtensionInput {
  kind: ExtensionKind;
  studentId?: string;
  teacherId?: string;
  /** ISO date-time. */
  newDeadline: string;
  reason: string;
}

export interface SubmitInput {
  clientKey: string;
  typedAnswer?: string;
  pageCount?: number;
}

const enc = encodeURIComponent;

/** Where one student's answer lives: the student's own routes, or a teacher's routes for that student. */
export interface AnswerTarget {
  testId: string;
  /** null: the signed-in student themself. */
  studentId: string | null;
}

export const answerBase = (t: AnswerTarget) =>
  t.studentId ? `/teacher/tests/${enc(t.testId)}/students/${enc(t.studentId)}` : `/me/tests/${enc(t.testId)}`;

export const answersApi = {
  view: (t: AnswerTarget) => api<AnswerView>(answerBase(t)),
  pending: (t: AnswerTarget, key: string) => api<PendingUpload>(`${answerBase(t)}/uploads/${enc(key)}`),
  uploadPage: (t: AnswerTarget, key: string, page: number, file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    return api<PendingUpload>(`${answerBase(t)}/uploads/${enc(key)}/pages/${page}`, { method: "POST", body: form, signal });
  },
  removePage: (t: AnswerTarget, key: string, page: number) => api<PendingUpload>(`${answerBase(t)}/uploads/${enc(key)}/pages/${page}`, { method: "DELETE" }),
  submit: (t: AnswerTarget, body: SubmitInput) => api<AnswerView>(`${answerBase(t)}/submission`, { method: "POST", body }),
  page: (t: AnswerTarget, versionId: string, page: number): Promise<DownloadedFile> =>
    apiBlob(`${answerBase(t)}/versions/${enc(versionId)}/pages/${page}`, {}, `page-${page}`),
  paper: (testId: string, asTeacher: boolean): Promise<DownloadedFile> =>
    apiBlob(`${asTeacher ? "/teacher" : "/me"}/tests/${enc(testId)}/paper`, {}, "test-paper"),
};

export const myTestsApi = {
  list: (f: { window?: AnswerWindow; page?: number; limit?: number } = {}) => api<Page<MyTestRow>>("/me/tests", { query: { ...f } }),
};

export const teacherTestsApi = {
  list: (f: { window?: AnswerWindow; page?: number; limit?: number } = {}) => api<Page<TeacherTestRow>>("/teacher/tests", { query: { ...f } }),
  students: (testId: string, f: { status?: TrackingState; schoolId?: string; q?: string; page?: number; limit?: number } = {}) =>
    api<Page<TeacherStudentRow> & { counts: { students: number; submitted: number; notSubmitted: number; lateBlocked: number } }>(
      `/teacher/tests/${enc(testId)}/students`, { query: { ...f } }),
};

const A = (testId: string) => `/admin/tests/${enc(testId)}`;

export const testExtensionsApi = {
  list: (testId: string, f: { state?: "active" | "cancelled" | "all"; kind?: ExtensionKind; page?: number; limit?: number } = {}) =>
    api<Page<TestExtension>>(`${A(testId)}/extensions`, { query: { ...f } }),
  targets: (testId: string, kind: "STUDENT" | "TEACHER", q?: string, page = 1) =>
    api<Page<ExtensionTarget>>(`${A(testId)}/extension-targets`, { query: { kind, q, page, limit: 10 } }),
  create: (testId: string, body: CreateExtensionInput) => api<TestExtension>(`${A(testId)}/extensions`, { method: "POST", body }),
  update: (testId: string, id: string, body: { newDeadline?: string; reason: string }) =>
    api<TestExtension>(`${A(testId)}/extensions/${enc(id)}`, { method: "PATCH", body }),
  cancel: (testId: string, id: string, reason: string) => api<TestExtension>(`${A(testId)}/extensions/${enc(id)}/cancel`, { method: "POST", body: { reason } }),
};

export const testTrackingApi = {
  list: (testId: string, f: { status?: TrackingFilter; schoolId?: string; division?: "JUNIOR" | "SENIOR"; q?: string; page?: number; limit?: number } = {}) =>
    api<TrackingPage>(`${A(testId)}/submissions`, { query: { ...f } }),
  get: (testId: string, submissionId: string) => api<StaffSubmissionDetail>(`${A(testId)}/submissions/${enc(submissionId)}`),
  page: (testId: string, submissionId: string, versionId: string, page: number): Promise<DownloadedFile> =>
    apiBlob(`${A(testId)}/submissions/${enc(submissionId)}/versions/${enc(versionId)}/pages/${page}`, {}, `page-${page}`),
};
