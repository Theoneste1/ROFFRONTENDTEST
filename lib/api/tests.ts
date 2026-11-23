/**
 * Test Management, Phase 1 (capability `testManagement`; owner-approved plan 2026-11-19). Administrators: every subject;
 * Head Coaches: the subjects they head (the backend checks the subject on every request: 403 SCOPE_FORBIDDEN otherwise).
 *
 *   GET    /admin/tests/subjects                        tests.view    the caller's subjects { id, code, name }
 *   GET    /admin/tests?subjectId&division&status&q     tests.view    paginated list
 *   POST   /admin/tests                                 tests.manage  create a DRAFT (optional questions)
 *   GET    /admin/tests/:id                             tests.view    detail with questions and files
 *   PATCH  /admin/tests/:id                             tests.manage  change details
 *   DELETE /admin/tests/:id                             tests.manage  a DRAFT only
 *   POST   /admin/tests/:id/publish | unpublish         tests.manage
 *   POST   /admin/tests/:id/questions                   tests.manage  append { prompt, maxMarks }
 *   PATCH  /admin/tests/:id/questions/:questionId       tests.manage
 *   DELETE /admin/tests/:id/questions/:questionId       tests.manage
 *   PUT    /admin/tests/:id/questions/order             tests.manage  { questionIds } (every question once)
 *   PUT    /admin/tests/:id/files/paper|marking-guide   tests.manage  multipart `file` (PDF or image, 20 MB)
 *   GET    /admin/tests/:id/files/paper|marking-guide   tests.view    neutral file name
 *   DELETE /admin/tests/:id/files/paper|marking-guide   tests.manage
 *   GET    /admin/test-markers?subjectId&state          tests.manageMarkers
 *   GET    /admin/test-markers/candidates?subjectId&q   tests.manageMarkers
 *   POST   /admin/test-markers                          tests.manageMarkers  { coachId, subjectId, reason? }
 *   POST   /admin/test-markers/:id/revoke               tests.manageMarkers  { reason } (mandatory)
 */
import { api, apiBlob, type DownloadedFile } from "./client";
import type { Page } from "./types";

/** A division code (JUNIOR, MIDDLE, SENIOR or one an Administrator created) or ALL. */
export type TestDivision = string;
export type TestAnswerFormat = "UPLOAD_ONLY" | "TYPED_ONLY" | "BOTH";
export type TestStatus = "DRAFT" | "PUBLISHED";
/** The file kinds as they appear in the URL. */
export type TestFileKind = "paper" | "marking-guide";

export interface TestSubject {
  id: string;
  code: string;
  name: string;
}

export interface TestPerson {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string;
}

export interface TestFileInfo {
  fileId: string;
  /** Neutral name (test-paper.pdf, marking-guide.png …), never the uploader's own. */
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface TestQuestion {
  id: string;
  order: number;
  prompt: string;
  maxMarks: number;
}

export interface TestSummary {
  id: string;
  title: string;
  subject: TestSubject;
  division: TestDivision;
  answerFormat: TestAnswerFormat;
  opensAt: string;
  closesAt: string;
  originalClosesAt: string;
  deadlineMoved: boolean;
  maxMarks: number;
  status: TestStatus;
  publishedAt: string | null;
  questionCount: number;
  questionMarksTotal: number;
  questionsComplete: boolean;
  files: { paper: TestFileInfo | null; markingGuide: TestFileInfo | null };
  createdBy: TestPerson | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestDetail extends TestSummary {
  questions: TestQuestion[];
  /** Phase 2 (testSubmissions): how many students have submitted; above 0 the test keeps its essentials. */
  submissionCount?: number;
}

export interface TestFilters {
  subjectId?: string;
  division?: TestDivision;
  status?: TestStatus;
  q?: string;
  page?: number;
  limit?: number;
}

export interface TestDetailsInput {
  title: string;
  subjectId: string;
  division: TestDivision;
  answerFormat: TestAnswerFormat;
  /** ISO date-time. */
  opensAt: string;
  closesAt: string;
  maxMarks: number;
}

export interface QuestionInput {
  prompt: string;
  maxMarks: number;
}

export interface MarkerAuthorization {
  id: string;
  active: boolean;
  coach: TestPerson & { accountStatus: string; interestedInSubject: boolean };
  subject: TestSubject;
  grantedAt: string;
  grantedBy: TestPerson | null;
  grantReason: string | null;
  revokedAt: string | null;
  revokedBy: TestPerson | null;
  revokeReason: string | null;
}

export interface MarkerCandidate extends TestPerson {
  /** A hint only: an interest never grants marking. */
  interestedInSubject: boolean;
  /** The coach's active authorisation for this subject, or null. */
  authorizationId: string | null;
  /** Owner 2026-11-23 (coachProgrammeAccess): a member of the subject's programme marks by default. */
  programmeMember?: boolean;
  /** Marking taken away from this coach in this subject (with the reason); authorising gives it back. */
  markingRemoved?: { id: string; reason: string } | null;
  /** Whether the coach may mark this subject now. */
  mayMark?: boolean;
}

export type MarkerState = "active" | "revoked" | "all";

const T = "/admin/tests";
const M = "/admin/test-markers";
const id_ = (id: string) => encodeURIComponent(id);

export const testsApi = {
  subjects: () => api<TestSubject[]>(`${T}/subjects`),
  list: (f: TestFilters = {}) => api<Page<TestSummary>>(T, { query: { ...f } }),
  get: (id: string) => api<TestDetail>(`${T}/${id_(id)}`),
  create: (body: TestDetailsInput & { questions?: QuestionInput[] }) => api<TestDetail>(T, { method: "POST", body }),
  update: (id: string, body: Partial<TestDetailsInput>) => api<TestDetail>(`${T}/${id_(id)}`, { method: "PATCH", body }),
  remove: (id: string) => api<void>(`${T}/${id_(id)}`, { method: "DELETE" }),
  publish: (id: string) => api<TestDetail>(`${T}/${id_(id)}/publish`, { method: "POST" }),
  unpublish: (id: string) => api<TestDetail>(`${T}/${id_(id)}/unpublish`, { method: "POST" }),
  addQuestion: (id: string, body: QuestionInput) => api<TestDetail>(`${T}/${id_(id)}/questions`, { method: "POST", body }),
  updateQuestion: (id: string, questionId: string, body: Partial<QuestionInput>) =>
    api<TestDetail>(`${T}/${id_(id)}/questions/${id_(questionId)}`, { method: "PATCH", body }),
  removeQuestion: (id: string, questionId: string) => api<TestDetail>(`${T}/${id_(id)}/questions/${id_(questionId)}`, { method: "DELETE" }),
  reorderQuestions: (id: string, questionIds: string[]) => api<TestDetail>(`${T}/${id_(id)}/questions/order`, { method: "PUT", body: { questionIds } }),
  putFile: (id: string, kind: TestFileKind, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api<TestDetail>(`${T}/${id_(id)}/files/${kind}`, { method: "PUT", body: form });
  },
  removeFile: (id: string, kind: TestFileKind) => api<TestDetail>(`${T}/${id_(id)}/files/${kind}`, { method: "DELETE" }),
  file: (id: string, kind: TestFileKind): Promise<DownloadedFile> => apiBlob(`${T}/${id_(id)}/files/${kind}`, {}, kind === "paper" ? "test-paper" : "marking-guide"),
};

export const testMarkersApi = {
  list: (f: { subjectId?: string; state?: MarkerState; page?: number; limit?: number } = {}) => api<Page<MarkerAuthorization>>(M, { query: { ...f } }),
  candidates: (subjectId: string, q?: string, page = 1) => api<Page<MarkerCandidate>>(`${M}/candidates`, { query: { subjectId, q, page, limit: 20 } }),
  grant: (body: { coachId: string; subjectId: string; reason?: string }) => api<MarkerAuthorization>(M, { method: "POST", body }),
  revoke: (id: string, reason: string) => api<MarkerAuthorization>(`${M}/${id_(id)}/revoke`, { method: "POST", body: { reason } }),
};
