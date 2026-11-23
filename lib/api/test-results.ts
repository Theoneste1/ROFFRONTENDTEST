/**
 * Test Management, Phase 4 (capability `testResults`; owner-approved plan 2026-11-19): publication with the
 * Administrators' override, results, internal rankings, reports, dashboards. The backend enforces every rule (who may
 * publish, the block while results are unapproved, the override's mandatory reason, the transition table, G6 withdrawal on
 * unlock, what students and teachers may see); the screens only show and send.
 *
 *   Administrators, Head Coaches (their subjects)
 *     GET  /admin/tests/:id/results?published&schoolId&division&q        tests.viewResults: final results with identity
 *     GET  /admin/tests/:id/results/preview?page&limit                   tests.publishResults: counts, unapproved, warnings
 *     POST /admin/tests/:id/results/publish { clientKey? }               tests.publishResults (409 PUBLICATION_BLOCKED)
 *     POST /admin/tests/:id/results/publish/override { reason, clientKey? }   tests.overridePublication: Administrators only
 *     GET  /admin/tests/:id/results/publications                         publications and recent withdrawals
 *     GET  /admin/tests/:id/results/rankings?by&division&schoolId&published   tests.viewRankings
 *     GET  /admin/tests/:id/results/report?published                     tests.viewResults
 *     GET  /admin/tests/:id/results/export.csv?type&published            tests.viewResults (CSV)
 *     GET  /admin/test-reports?subjectId&q                               tests.viewResults: the reporting overview
 *     GET  /admin/test-dashboard                                         tests.view
 *   Students   GET /me/test-results, /me/test-results/:testId (tests.viewOwnResults), /me/test-dashboard (tests.submit)
 *   Teachers   GET /teacher/test-results, /:testId, /:testId/students/:studentId (tests.viewSchoolResults),
 *              /teacher/test-dashboard (tests.submitForStudents)
 *   Coaches    GET /marking/dashboard (tests.mark; blind)
 */
import { api } from "./client";
import { downloadCsv } from "./admin";
import type { TestPerson, TestSubject } from "./tests";
import type { SubmissionStatus } from "./test-submissions";
import type { MarkingKind } from "./test-marking";
import type { Page } from "./types";

export type RankingBy = "overall" | "division" | "school";
/** A division code or UNKNOWN. */
export type RankingDivision = string;
export type ExportType = "results" | "schools" | "divisions" | "questions";
export type PreviewWarning = "UNAPPROVED_RESULTS" | "ACTIVE_INDIVIDUAL_EXTENSIONS" | "ACTIVE_TEST_EXTENSION" | "DEADLINE_NOT_PASSED";

export interface PublicationCounts {
  total: number;
  byStatus: Partial<Record<SubmissionStatus, number>>;
  /** Approved, waiting to be published. */
  approved: number;
  published: number;
  unapproved: number;
}

export interface Publication {
  id: string;
  number: number;
  actorRole: string;
  override: boolean;
  overrideReason: string | null;
  publishedCount: number;
  counts: Record<string, unknown>;
  createdAt: string;
  publishedBy: TestPerson | null;
  withdrawn: number;
}

export interface UnapprovedRow {
  id: string;
  publicCode: string;
  status: SubmissionStatus;
  updatedAt: string;
  student: TestPerson & { school: { id: string; name: string } | null };
}

export interface ActiveExtension {
  id: string;
  kind: "TEST" | "STUDENT" | "TEACHER";
  newDeadline: string;
  reason: string;
  student: TestPerson | null;
  teacher: TestPerson | null;
}

export interface PublicationPreview {
  test: { id: string; title: string; status: string; maxMarks: number; closesAt: string; discipline: TestSubject };
  now: string;
  deadlinePassed: boolean;
  counts: PublicationCounts;
  unapproved: Page<UnapprovedRow>;
  activeExtensions: ActiveExtension[];
  warnings: PreviewWarning[];
  publications: number;
  latestPublication: Publication | null;
  actions: { publish: boolean; blocked: boolean; override: boolean };
}

export interface PublishResult { replayed: boolean; published: number; publication: Publication }

export interface Withdrawal {
  id: string;
  reason: string;
  actorRole: string;
  createdAt: string;
  publicationId: string;
  withdrawnBy: TestPerson | null;
  submission: { id: string; publicCode: string; status: SubmissionStatus; student: { id: string; firstName: string; lastName: string } };
}

export interface PublicationsPage extends Page<Publication> { withdrawals: Withdrawal[] }

export interface StudentRef extends TestPerson { gradeLevel: string | null; school: { id: string; name: string } | null }

export interface ResultRow {
  id: string;
  publicCode: string;
  status: SubmissionStatus;
  publishedAt: string | null;
  publicationId: string | null;
  student: StudentRef;
  totalMarks: number | null;
  finalKind: MarkingKind | null;
  maxMarks: number;
  published: boolean;
  withdrawals: number;
}

export interface RankingRow {
  rank: number;
  groupSize: number;
  group: null | { division: RankingDivision } | { schoolId: string | null; schoolName: string | null };
  submissionId: string;
  publicCode: string;
  status: SubmissionStatus;
  published: boolean;
  totalMarks: number;
  student: TestPerson & { gradeLevel: string | null; division: RankingDivision };
  school: { id: string; name: string | null } | null;
}

export interface RankingsPage extends Page<RankingRow> {
  test: { id: string; title: string; maxMarks: number; discipline: TestSubject };
  by: RankingBy;
  method: "COMPETITION";
}

export interface Stat { results: number; average: number | null; median: number | null; min: number | null; max: number | null }

export interface ResultsReport {
  test: { id: string; title: string; status: string; division: string; maxMarks: number; opensAt: string; closesAt: string; discipline: TestSubject };
  published: boolean;
  counts: PublicationCounts;
  publications: number;
  summary: Stat & { maxMarks: number };
  distribution: Array<{ from: number; to: number; count: number }>;
  bySchool: Array<Stat & { schoolId: string | null; schoolName: string | null }>;
  byDivision: Array<Stat & { division: RankingDivision }>;
  questions: Array<{ id: string; order: number; prompt: string; maxMarks: number; results: number; average: number | null; min: number | null; max: number | null }>;
}

export interface ReportOverviewRow {
  id: string; title: string; division: string; maxMarks: number; opensAt: string; closesAt: string;
  subject: TestSubject; counts: PublicationCounts;
  results: number; average: number | null; min: number | null; max: number | null;
  publications: number; lastPublishedAt: string | null;
}

// ── Students and teachers ──────────────────────────────────────────────────────

export interface ResultTestRef { id: string; title: string; division: string; subject: TestSubject }

export interface ResultView {
  totalMarks: number | null;
  maxMarks: number;
  comment: string | null;
  questions: Array<{ order: number; prompt: string; maxMarks: number; marks: number | null; comment: string | null }>;
}

export interface MyResultRow { test: ResultTestRef; totalMarks: number | null; maxMarks: number; publishedAt: string | null }

export interface PublishedResult {
  test: ResultTestRef & { maxMarks: number };
  student?: StudentRef;
  publishedAt: string | null;
  result: ResultView;
}

export interface SchoolTestRow { test: ResultTestRef & { closesAt: string }; maxMarks: number; publishedResults: number; lastPublishedAt: string | null }

export interface SchoolResultsPage extends Page<{ student: StudentRef; totalMarks: number | null; maxMarks: number; publishedAt: string | null }> {
  test: ResultTestRef & { maxMarks: number };
}

// ── Dashboards ─────────────────────────────────────────────────────────────────

export interface DashboardTest {
  id: string; title: string; subject: TestSubject; division: string; answerFormat: string; maxMarks: number;
  opensAt: string; deadline: string; window: "UPCOMING" | "OPEN" | "CLOSED";
}

export interface StudentDashboard {
  open: Array<DashboardTest & { submission: { status: SubmissionStatus; versionCount: number; lastSubmittedAt: string | null } | null; canSubmit: boolean }>;
  upcoming: Array<DashboardTest & { submission: unknown; canSubmit: boolean }>;
  counts: { open: number; upcoming: number; submitted: number; awaitingResults: number; publishedResults: number };
  results: MyResultRow[];
}

export interface TeacherDashboard {
  open: Array<DashboardTest & { students: number; submitted: number; missing: number }>;
  counts: { openTests: number; testsWithResults: number; activeExtensions: number };
  extensions: Array<{ id: string; kind: "TEST" | "STUDENT" | "TEACHER"; newDeadline: string; test: { id: string; title: string }; student: TestPerson | null }>;
  results: SchoolTestRow[];
}

export interface CoachDashboard {
  counts: { total: number; notStarted: number; inProgress: number; marked: number; returned: number; secondMarkings: number; needsAction: number };
  tests: Array<{ test: { id: string; title: string; subject: string }; assigned: number; notStarted: number; inProgress: number; marked: number; returned: number; secondMarkings: number }>;
}

export interface StaffDashboard {
  scope: "all" | "subjects";
  now: string;
  subjects: Array<{
    subject: TestSubject;
    tests: { draft: number; published: number };
    submissions: PublicationCounts;
    pendingReview: number; returned: number; awaitingSecondMarking: number; readyToPublish: number;
    activeExtensions: number; authorisedMarkers: number; headCoaches: number;
  }>;
  tests: Array<{ id: string; title: string; status: string; closesAt: string; subject: TestSubject; counts: PublicationCounts; activeExtensions: number; publications: number; lastPublishedAt: string | null }>;
  coaches: Array<{ coach: { id: string; firstName: string; lastName: string }; assigned: number; notStarted: number; inProgress: number; marked: number; returned: number }>;
  rankings: null | { test: { id: string; title: string; maxMarks: number }; top: Array<{ rank: number; totalMarks: number; student: { id: string; firstName: string; lastName: string }; school: string | null }> };
}

const enc = encodeURIComponent;
const R = (testId: string) => `/admin/tests/${enc(testId)}/results`;

export const testResultsApi = {
  list: (testId: string, f: { published?: boolean; schoolId?: string; division?: RankingDivision; q?: string; page?: number; limit?: number } = {}) =>
    api<Page<ResultRow>>(R(testId), { query: { ...f } }),
  preview: (testId: string, f: { page?: number; limit?: number } = {}) => api<PublicationPreview>(`${R(testId)}/preview`, { query: { ...f } }),
  publish: (testId: string, body: { clientKey?: string } = {}) => api<PublishResult>(`${R(testId)}/publish`, { method: "POST", body }),
  publishWithOverride: (testId: string, body: { reason: string; clientKey?: string }) =>
    api<PublishResult>(`${R(testId)}/publish/override`, { method: "POST", body }),
  publications: (testId: string, f: { page?: number; limit?: number } = {}) => api<PublicationsPage>(`${R(testId)}/publications`, { query: { ...f } }),
  rankings: (testId: string, f: { by?: RankingBy; division?: RankingDivision; schoolId?: string; published?: boolean; page?: number; limit?: number } = {}) =>
    api<RankingsPage>(`${R(testId)}/rankings`, { query: { ...f } }),
  report: (testId: string, f: { published?: boolean } = {}) => api<ResultsReport>(`${R(testId)}/report`, { query: { ...f } }),
  exportCsv: (testId: string, f: { type?: ExportType; published?: boolean } = {}) =>
    downloadCsv(`${R(testId)}/export.csv`, { ...f }, `test-results-${f.type ?? "results"}.csv`),
  overview: (f: { subjectId?: string; q?: string; page?: number; limit?: number } = {}) => api<Page<ReportOverviewRow>>("/admin/test-reports", { query: { ...f } }),
  dashboard: () => api<StaffDashboard>("/admin/test-dashboard"),
};

export const myResultsApi = {
  list: (f: { page?: number; limit?: number } = {}) => api<Page<MyResultRow>>("/me/test-results", { query: { ...f } }),
  get: (testId: string) => api<PublishedResult>(`/me/test-results/${enc(testId)}`),
  dashboard: () => api<StudentDashboard>("/me/test-dashboard"),
};

export const schoolResultsApi = {
  tests: (f: { page?: number; limit?: number } = {}) => api<Page<SchoolTestRow>>("/teacher/test-results", { query: { ...f } }),
  results: (testId: string, f: { schoolId?: string; q?: string; page?: number; limit?: number } = {}) =>
    api<SchoolResultsPage>(`/teacher/test-results/${enc(testId)}`, { query: { ...f } }),
  get: (testId: string, studentId: string) => api<PublishedResult>(`/teacher/test-results/${enc(testId)}/students/${enc(studentId)}`),
  dashboard: () => api<TeacherDashboard>("/teacher/test-dashboard"),
};

/** Coaches (owner 2026-11-23): the published results of their programmes' tests, every level (no ranks, codes or markers). */
export const coachResultsApi = {
  tests: (f: { page?: number; limit?: number } = {}) => api<Page<SchoolTestRow>>("/coach/test-results", { query: { ...f } }),
  results: (testId: string, f: { schoolId?: string; q?: string; page?: number; limit?: number } = {}) =>
    api<SchoolResultsPage>(`/coach/test-results/${enc(testId)}`, { query: { ...f } }),
  get: (testId: string, studentId: string) => api<PublishedResult>(`/coach/test-results/${enc(testId)}/students/${enc(studentId)}`),
};

export const coachDashboardApi = {
  dashboard: () => api<CoachDashboard>("/marking/dashboard"),
};
