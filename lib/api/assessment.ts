/** Assignments, submissions and results (student side). */
import { api, apiBlob, type QueryValue } from "./client";
import type {
  Page,
  ResultDetail,
  ResultSummary,
  StudentAssignment,
  Submission,
  SubmissionHistory,
} from "./types";

export interface MyAssignmentFilters {
  q?: string;
  courseId?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export interface MyResultFilters {
  courseId?: string;
  academicYearId?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export interface NewSubmission {
  assignmentId: string;
  answerText?: string;
  note?: string;
  files?: File[];
}

/** Backend upload rules for submissions (src/common/storage). */
export const SUBMISSION_UPLOAD = {
  maxFiles: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxRequestBytes: 100 * 1024 * 1024,
  accept: ".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.doc,.docx,.zip,.txt",
  label: "PDF, images (incl. HEIC), Word, ZIP or plain text — up to 20 MB each, 10 files",
  answerMax: 20000,
  noteMax: 1000,
};

export const assignmentsApi = {
  /** Student: assignments of their division, with `displayStatus` and `canSubmit`. */
  mine: (filters: MyAssignmentFilters = {}) => api<Page<StudentAssignment>>("/me/assignments", { query: filters }),
  get: (assignmentId: string) => api<StudentAssignment>(`/assignments/${assignmentId}`),
  briefFile: (assignmentId: string, attachmentId: string, name?: string) =>
    apiBlob(`/assignments/${assignmentId}/attachments/${attachmentId}/file`, {}, name),
};

export const submissionsApi = {
  /** Submit or resubmit (same call). Multipart: answerText, note, files. */
  submit: ({ assignmentId, answerText, note, files = [] }: NewSubmission) => {
    const form = new FormData();
    form.set("assignmentId", assignmentId);
    if (answerText?.trim()) form.set("answerText", answerText.trim());
    if (note?.trim()) form.set("note", note.trim());
    for (const f of files) form.append("files", f);
    return api<Submission>("/submissions", { method: "POST", body: form });
  },
  get: (submissionId: string) => api<Submission>(`/submissions/${submissionId}`),
  history: (submissionId: string) => api<SubmissionHistory>(`/submissions/${submissionId}/history`),
  mine: (filters: { assignmentId?: string; page?: number; limit?: number } = {}) =>
    api<Page<Submission>>("/me/submissions", { query: filters }),
  attachmentFile: (submissionId: string, attachmentId: string, name?: string) =>
    apiBlob(`/submissions/${submissionId}/attachments/${attachmentId}/file`, {}, name),
};

export const resultsApi = {
  mine: (filters: MyResultFilters = {}) => api<Page<ResultSummary>>("/me/results", { query: filters }),
  get: (submissionId: string) => api<ResultDetail>(`/me/results/${submissionId}`),
  feedbackFile: (submissionId: string, attachmentId: string, name?: string) =>
    apiBlob(`/me/results/${submissionId}/feedback-files/${attachmentId}`, {}, name),
};
