/** Mentor endpoints: teaching scopes, assignments, reviews, resources, analytics. */
import { api, apiBlob, type QueryValue } from "./client";
import type {
  AssignmentEvent,
  AssignmentStatus,
  CourseAnalytics,
  CourseResource,
  MentorAssignment,
  Page,
  ResourceType,
  ReviewCycle,
  ReviewSubmission,
  SubmissionStatus,
  TeachingScope,
} from "./types";

// ─── Upload rules (backend src/common/storage) ──────────────────────────────

export const BRIEF_UPLOAD = {
  maxFiles: 10,
  maxFileBytes: 20 * 1024 * 1024,
  accept: ".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.doc,.docx,.zip,.txt",
  label: "PDF, images, Word, ZIP or plain text — up to 20 MB each, 10 files",
};

export const FEEDBACK_UPLOAD = {
  maxFiles: 10,
  maxFileBytes: 10 * 1024 * 1024,
  accept: ".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.doc,.docx,.txt",
  label: "PDF, images, Word or plain text — up to 10 MB each",
};

export const RESOURCE_UPLOAD = {
  maxFiles: 10,
  maxFileBytes: 50 * 1024 * 1024,
  accept: ".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.doc,.docx,.ppt,.pptx,.epub,.zip,.txt",
  label: "PDF, images, Word, PowerPoint, EPUB, ZIP or plain text — up to 50 MB each",
};

/** Field limits from the backend DTOs. */
export const ASSIGNMENT_RULES = {
  title: { min: 3, max: 200 },
  description: { max: 500 },
  instructions: { min: 10, max: 10000 },
  points: { min: 0, max: 10000 },
  maximumMarks: { min: 1, max: 10000 },
  maxResubmissions: { min: 0, max: 50 },
};

export const REVIEW_RULES = {
  feedback: { min: 2, max: 10000 },
  resubmissionNote: { min: 5, max: 2000 },
};

export const RESOURCE_RULES = {
  title: { min: 2, max: 200 },
  description: { max: 2000 },
  author: { max: 200 },
  source: { max: 200 },
  year: { min: 1800, max: 2200 },
  tags: { max: 20, tagMax: 40, pattern: /^[\p{L}\p{N}][\p{L}\p{N} _.+-]*$/u },
};

// ─── Assignments ────────────────────────────────────────────────────────────

export interface AssignmentFilters {
  courseId?: string;
  divisionId?: string;
  status?: AssignmentStatus;
  createdById?: string;
  q?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export interface AssignmentInput {
  title: string;
  courseId: string;
  divisionId: string;
  description?: string;
  instructions: string;
  /** ISO 8601. */
  deadline: string;
  points: number;
  maximumMarks: number;
  allowResubmission: boolean;
  maxResubmissions: number;
  allowLateSubmission: boolean;
}

function filesForm(files: File[], field = "files"): FormData {
  const form = new FormData();
  for (const f of files) form.append(field, f);
  return form;
}

export const mentorAssignmentsApi = {
  list: (filters: AssignmentFilters = {}) => api<Page<MentorAssignment>>("/assignments", { query: filters }),
  get: (id: string) => api<MentorAssignment>(`/assignments/${id}`),
  history: (id: string) => api<AssignmentEvent[]>(`/assignments/${id}/history`),

  /** Creates a DRAFT (multipart, with optional brief files). */
  create: (input: AssignmentInput, files: File[] = []) => {
    const form = new FormData();
    form.set("title", input.title.trim());
    form.set("courseId", input.courseId);
    form.set("divisionId", input.divisionId);
    if (input.description?.trim()) form.set("description", input.description.trim());
    form.set("instructions", input.instructions.trim());
    form.set("deadline", input.deadline);
    form.set("points", String(input.points));
    form.set("maximumMarks", String(input.maximumMarks));
    form.set("allowResubmission", String(input.allowResubmission));
    if (input.allowResubmission) form.set("maxResubmissions", String(input.maxResubmissions));
    form.set("allowLateSubmission", String(input.allowLateSubmission));
    for (const f of files) form.append("files", f);
    return api<MentorAssignment>("/assignments", { method: "POST", body: form });
  },

  /** DRAFT or REJECTED only. Course and division cannot change after creation. */
  update: (id: string, input: Partial<Omit<AssignmentInput, "courseId" | "divisionId">>) =>
    api<MentorAssignment>(`/assignments/${id}`, { method: "PATCH", body: input }),
  addAttachments: (id: string, files: File[]) =>
    api<MentorAssignment>(`/assignments/${id}/attachments`, { method: "POST", body: filesForm(files) }),
  removeAttachment: (id: string, attachmentId: string) =>
    api<unknown>(`/assignments/${id}/attachments/${attachmentId}`, { method: "DELETE" }),
  /** DRAFT/REJECTED → PENDING_APPROVAL (an administrator publishes). */
  submitForApproval: (id: string) => api<MentorAssignment>(`/assignments/${id}/submit`, { method: "PATCH" }),
  /** PENDING_APPROVAL → DRAFT. */
  recall: (id: string) => api<MentorAssignment>(`/assignments/${id}/recall`, { method: "PATCH" }),
  briefFile: (id: string, attachmentId: string, name?: string) => apiBlob(`/assignments/${id}/attachments/${attachmentId}/file`, {}, name),
};

// ─── Reviews ────────────────────────────────────────────────────────────────

export interface ReviewFilters {
  assignmentId?: string;
  courseId?: string;
  divisionId?: string;
  status?: SubmissionStatus;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export const reviewsApi = {
  /** Submissions currently assigned to the mentor. */
  queue: (filters: ReviewFilters = {}) => api<Page<ReviewSubmission>>("/mentor/reviews", { query: filters }),
  submission: (id: string) => api<ReviewSubmission>(`/submissions/${id}`),
  cycles: (id: string) => api<ReviewCycle[]>(`/submissions/${id}/reviews`),
  /** ASSIGNED / SENT_BACK → IN_PROGRESS. */
  start: (id: string) => api<ReviewSubmission>(`/submissions/${id}/start-review`, { method: "PATCH" }),
  /** Score + feedback (+ feedback files). Can be repeated until submitted to the admin. */
  mark: (id: string, score: number, mentorFeedback: string, files: File[] = []) => {
    const form = new FormData();
    form.set("score", String(score));
    form.set("mentorFeedback", mentorFeedback.trim());
    for (const f of files) form.append("feedbackFiles", f);
    return api<ReviewSubmission>(`/submissions/${id}/mark`, { method: "PATCH", body: form });
  },
  /** MARKED → submitted to the administrator for approval. */
  submitToAdmin: (id: string) => api<ReviewSubmission>(`/submissions/${id}/submit-to-admin`, { method: "PATCH" }),
  requestResubmission: (id: string, note: string, dueAt?: string) =>
    api<ReviewSubmission>(`/submissions/${id}/request-resubmission`, {
      method: "PATCH",
      body: dueAt ? { note: note.trim(), dueAt } : { note: note.trim() },
    }),
  withdrawResubmission: (id: string) => api<ReviewSubmission>(`/submissions/${id}/withdraw-resubmission-request`, { method: "PATCH" }),
  removeFeedbackFile: (id: string, attachmentId: string) =>
    api<unknown>(`/submissions/${id}/review/attachments/${attachmentId}`, { method: "DELETE" }),
  submissionFile: (id: string, attachmentId: string, name?: string) =>
    apiBlob(`/submissions/${id}/attachments/${attachmentId}/file`, {}, name),
  feedbackFile: (id: string, attachmentId: string, name?: string) =>
    apiBlob(`/submissions/${id}/feedback-files/${attachmentId}`, {}, name),
};

// ─── Resources ──────────────────────────────────────────────────────────────

export interface ResourceInput {
  divisionId: string;
  type: ResourceType;
  title: string;
  description?: string;
  author?: string;
  source?: string;
  year?: number;
  tags?: string[];
}

export const mentorResourcesApi = {
  list: (courseId: string, divisionId: string, includeArchived = true) =>
    api<CourseResource[]>(`/courses/${courseId}/resources`, { query: { divisionId, includeArchived } }),
  get: (courseId: string, resourceId: string) => api<CourseResource>(`/courses/${courseId}/resources/${resourceId}`),
  create: (courseId: string, input: ResourceInput, files: File[] = []) => {
    const form = new FormData();
    form.set("divisionId", input.divisionId);
    form.set("type", input.type);
    form.set("title", input.title.trim());
    if (input.description?.trim()) form.set("description", input.description.trim());
    if (input.author?.trim()) form.set("author", input.author.trim());
    if (input.source?.trim()) form.set("source", input.source.trim());
    if (input.year) form.set("year", String(input.year));
    if (input.tags?.length) form.set("tags", input.tags.join(","));
    for (const f of files) form.append("files", f);
    return api<CourseResource>(`/courses/${courseId}/resources`, { method: "POST", body: form });
  },
  update: (courseId: string, resourceId: string, input: Partial<Omit<ResourceInput, "divisionId">>) =>
    api<CourseResource>(`/courses/${courseId}/resources/${resourceId}`, { method: "PATCH", body: input }),
  remove: (courseId: string, resourceId: string) => api<unknown>(`/courses/${courseId}/resources/${resourceId}`, { method: "DELETE" }),
  setState: (courseId: string, resourceId: string, action: "publish" | "unpublish" | "archive" | "restore") =>
    api<CourseResource>(`/courses/${courseId}/resources/${resourceId}/${action}`, { method: "PATCH" }),
  addAttachments: (courseId: string, resourceId: string, files: File[]) =>
    api<CourseResource>(`/courses/${courseId}/resources/${resourceId}/attachments`, { method: "POST", body: filesForm(files) }),
  removeAttachment: (courseId: string, resourceId: string, attachmentId: string) =>
    api<unknown>(`/courses/${courseId}/resources/${resourceId}/attachments/${attachmentId}`, { method: "DELETE" }),
  file: (courseId: string, resourceId: string, attachmentId: string, name?: string) =>
    apiBlob(`/courses/${courseId}/resources/${resourceId}/attachments/${attachmentId}/file`, {}, name),
};

// ─── Scopes & analytics ─────────────────────────────────────────────────────

export const teachingApi = {
  scopes: () => api<TeachingScope[]>("/me/teaching"),
  analytics: (courseId: string, divisionId: string) =>
    api<CourseAnalytics>(`/analytics/courses/${courseId}`, { query: { divisionId } }),
};
