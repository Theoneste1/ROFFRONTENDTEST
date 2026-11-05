/**
 * Administrator endpoints (role ADMIN). Contracts follow the backend DTOs and
 * ROFBACKENDTEST/docs/api/response-schemas.json. Admins approve, distribute
 * and publish — they never grade and never create assignments.
 */
import { api, apiBlob, saveFile, type QueryValue } from "./client";
import type {
  AdminDashboard,
  AdminDivision,
  AdminUser,
  AssignmentReportRow,
  AssignmentStatus,
  MentorAssignment,
  AuditCategory,
  AuditLogEntry,
  Course,
  CourseParticipationRow,
  GradeLevel,
  MentorReportRow,
  MentorRequest,
  MentorRequestApproval,
  MentorRequestStatus,
  MentorScope,
  Page,
  ReportFilters,
  ReportsOverview,
  ReportUserStatus,
  Role,
  SchoolDetail,
  SchoolRef,
  SchoolSummary,
  StudentReportRow,
  UserImportResult,
} from "./types";

type Query = Record<string, QueryValue>;

/** Download an authenticated CSV export and save it. */
export async function downloadCsv(path: string, query: Query = {}, fallbackName = "export.csv"): Promise<void> {
  saveFile(await apiBlob(path, { query }, fallbackName));
}

// ─── Dashboard & overview ───────────────────────────────────────────────────

export const adminDashboardApi = {
  dashboard: (filters: ReportFilters = {}) => api<AdminDashboard>("/admin/dashboard", { query: { ...filters } }),
  overview: () => api<ReportsOverview>("/admin/reports/overview"),
};

// ─── Audit log ──────────────────────────────────────────────────────────────

export interface AuditFilters {
  category?: AuditCategory;
  /** Action name contains (case-insensitive). */
  action?: string;
  actorId?: string;
  actorRole?: Role;
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export const auditApi = {
  list: (filters: AuditFilters = {}) => api<Page<AuditLogEntry>>("/admin/audit-logs", { query: filters }),
  get: (id: string) => api<AuditLogEntry>(`/admin/audit-logs/${id}`),
  actions: () => api<{ action: string; category: AuditCategory; count: number }[]>("/admin/audit-logs/actions"),
  exportCsv: (filters: AuditFilters = {}) => {
    const { page: _p, limit: _l, ...rest } = filters;
    void _p;
    void _l;
    return downloadCsv("/admin/audit-logs/export.csv", rest, "audit-log.csv");
  },
};

// ─── Users ──────────────────────────────────────────────────────────────────

export interface UserFilters {
  role?: Role;
  divisionId?: string;
  gradeLevel?: GradeLevel;
  schoolId?: string;
  isActive?: boolean;
  isApproved?: boolean;
  isActivated?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

/** Shared by create, invite and edit (backend CreateUserDto / InviteUserDto / UpdateUserDto). */
export const USER_RULES = {
  name: { min: 1, max: 100 },
  username: { min: 3, max: 30, pattern: /^[a-z0-9._-]+$/ },
  homeLocation: { min: 2, max: 200 },
  school: { min: 2, max: 200 },
  importMaxBytes: 1024 * 1024,
  importMaxRows: 1000,
};

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: Role;
  gradeLevel?: GradeLevel;
  schoolId?: string;
  homeLocation?: string;
}

export interface InviteUserInput {
  firstName: string;
  lastName: string;
  email: string;
  username?: string;
  role: Role;
  gradeLevel?: GradeLevel;
  schoolId?: string;
  schoolName?: string;
  schoolLocation?: string;
  homeLocation?: string;
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, "password">>;

/** Drop empty strings so optional fields are omitted, not sent as "". */
function compact<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

export const usersApi = {
  list: (filters: UserFilters = {}) => api<Page<AdminUser>>("/admin/users", { query: filters }),
  get: (id: string) => api<AdminUser>(`/admin/users/${id}`),
  /** Active immediately with the given password. */
  create: (input: CreateUserInput) => api<AdminUser>("/admin/users", { method: "POST", body: compact(input) }),
  /** No password; an activation link is e-mailed (valid 7 days). */
  invite: (input: InviteUserInput) =>
    api<{ user: AdminUser; invitation: { purpose: string; expiresAt: string } }>("/admin/users/invite", { method: "POST", body: compact(input) }),
  importCsv: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append("file", file);
    return api<UserImportResult>("/admin/users/import", { method: "POST", body: form, query: { dryRun } });
  },
  update: (id: string, input: UpdateUserInput) => api<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: input }),
  /** isActive=false suspends (all sessions end); isApproved approves a pending account. */
  setStatus: (id: string, status: { isActive?: boolean; isApproved?: boolean }) =>
    api<AdminUser>(`/admin/users/${id}/status`, { method: "PATCH", body: status }),
  resendInvitation: (id: string) => api<{ purpose: string; expiresAt: string }>(`/admin/users/${id}/resend-invitation`, { method: "POST" }),
  sendPasswordReset: (id: string) => api<{ message: string }>(`/admin/users/${id}/send-password-reset`, { method: "POST" }),
  /** Only accounts without academic history (409 USER_HAS_HISTORY otherwise). */
  remove: (id: string) => api<{ message: string }>(`/admin/users/${id}`, { method: "DELETE" }),
};

// ─── Divisions & schools (lookups) ──────────────────────────────────────────

export const divisionsApi = {
  list: () => api<AdminDivision[]>("/admin/divisions"),
  update: (id: string, input: { name?: string; description?: string; isActive?: boolean }) =>
    api<AdminDivision>(`/admin/divisions/${id}`, { method: "PATCH", body: input }),
};

export const schoolsApi = {
  list: (params: { search?: string; page?: number; limit?: number } = {}) => api<Page<SchoolSummary>>("/schools", { query: params }),
  get: (id: string, params: { page?: number; limit?: number } = {}) => api<SchoolDetail>(`/schools/${id}`, { query: params }),
  /** Public lookup (2–100 characters). */
  search: (q: string) => api<SchoolRef[]>("/schools/search", { query: { q } }),
};

// ─── Mentors ────────────────────────────────────────────────────────────────

export interface UserReportFilters extends ReportFilters {
  status?: ReportUserStatus;
  /** Name, username or e-mail contains. */
  q?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export const mentorsApi = {
  report: (filters: UserReportFilters = {}) =>
    api<Page<MentorReportRow> & { filters: unknown }>("/admin/reports/mentors", { query: filters }),
  scopes: (filters: { mentorId?: string; courseId?: string; divisionId?: string; isActive?: boolean; page?: number; limit?: number } = {}) =>
    api<Page<MentorScope>>("/admin/mentor-assignments", { query: filters }),
  /** Grant course × division access (re-activates an earlier one). */
  addScope: (input: { mentorId: string; courseId: string; divisionId: string }) =>
    api<MentorScope>("/admin/mentor-assignments", { method: "POST", body: input }),
  /** Deactivate; reports open reviews that should be reassigned. */
  removeScope: (id: string) => api<MentorScope & { openReviewsToReassign: number }>(`/admin/mentor-assignments/${id}`, { method: "DELETE" }),
};

export const mentorRequestsApi = {
  list: (params: { status?: MentorRequestStatus; page?: number; limit?: number } = {}) =>
    api<Page<MentorRequest>>("/mentor-requests", { query: params }),
  /** Creates the mentor account (activation e-mail when verification is on). */
  approve: (id: string) => api<MentorRequestApproval>(`/mentor-requests/${id}/approve`, { method: "PATCH" }),
  reject: (id: string) => api<{ id: string; status: MentorRequestStatus }>(`/mentor-requests/${id}/reject`, { method: "PATCH" }),
};

// ─── Students ───────────────────────────────────────────────────────────────

export const studentsApi = {
  report: (filters: UserReportFilters = {}) =>
    api<Page<StudentReportRow> & { filters: unknown }>("/admin/reports/students", { query: filters }),
  exportCsv: (filters: UserReportFilters = {}) => {
    const { page: _p, limit: _l, ...rest } = filters;
    void _p;
    void _l;
    return downloadCsv("/admin/reports/students.csv", rest, "students.csv");
  },
};

// ─── Courses ────────────────────────────────────────────────────────────────

export const COURSE_RULES = { title: { min: 3, max: 200 }, description: { min: 10, max: 2000 }, sortOrder: { min: 0, max: 1000 } };
export const DIVISION_RULES = { name: { min: 2, max: 100 }, description: { max: 1000 } };

export const coursesAdminApi = {
  update: (id: string, input: { title?: string; description?: string; sortOrder?: number; discussionsEnabled?: boolean }) =>
    api<Course>(`/admin/courses/${id}`, { method: "PATCH", body: input }),
  /** publish: DRAFT/ARCHIVED → PUBLISHED; unpublish hides all content from students; archive keeps history. */
  setState: (id: string, action: "publish" | "unpublish" | "archive") => api<Course>(`/admin/courses/${id}/${action}`, { method: "PATCH" }),
  participation: (filters: ReportFilters = {}) =>
    api<{ rows: CourseParticipationRow[]; filters: unknown }>("/admin/reports/course-participation", { query: { ...filters } }),
  /** Every active mentor scope (all pages). */
  allActiveScopes: async () => {
    const first = await mentorsApi.scopes({ isActive: true, limit: 100, page: 1 });
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, i) => mentorsApi.scopes({ isActive: true, limit: 100, page: i + 2 })),
    );
    return [first, ...rest].flatMap((p) => p.data);
  },
};

// ─── Assignments (approval and life cycle) ──────────────────────────────────

export const ASSIGNMENT_ADMIN_RULES = { rejectionNote: { min: 5, max: 1000 }, note: { min: 1, max: 1000 } };

export interface AdminAssignmentFilters {
  status?: AssignmentStatus;
  courseId?: string;
  divisionId?: string;
  q?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export const assignmentsAdminApi = {
  /** Admins see every assignment, in every state. */
  list: (filters: AdminAssignmentFilters = {}) => api<Page<MentorAssignment>>("/assignments", { query: filters }),
  report: (filters: ReportFilters & { status?: AssignmentStatus; page?: number; limit?: number } = {}) =>
    api<Page<AssignmentReportRow> & { summary: unknown }>("/admin/reports/assignments", { query: { ...filters } }),
  /** PENDING_APPROVAL → PUBLISHED (deadline must be in the future); students are notified. */
  publish: (id: string) => api<MentorAssignment>(`/assignments/${id}/publish`, { method: "PATCH" }),
  /** PENDING_APPROVAL → REJECTED: back to the mentor with a note. */
  reject: (id: string, rejectionNote: string) => api<MentorAssignment>(`/assignments/${id}/reject`, { method: "PATCH", body: { rejectionNote } }),
  /** PUBLISHED with no submissions → DRAFT. */
  unpublish: (id: string) => api<MentorAssignment>(`/assignments/${id}/unpublish`, { method: "PATCH" }),
  /** PUBLISHED → CLOSED: no more submissions. */
  close: (id: string, note?: string) => api<MentorAssignment>(`/assignments/${id}/close`, { method: "PATCH", body: note ? { note } : {} }),
  /** CLOSED → PUBLISHED; a new future deadline is needed when the old one passed (and late work is not accepted). */
  reopen: (id: string, input: { note?: string; deadline?: string }) =>
    api<MentorAssignment>(`/assignments/${id}/reopen`, { method: "PATCH", body: Object.fromEntries(Object.entries(input).filter(([, v]) => v)) }),
  /** Any state → ARCHIVED (read-only afterwards). */
  archive: (id: string) => api<MentorAssignment>(`/assignments/${id}/archive`, { method: "PATCH" }),
};
