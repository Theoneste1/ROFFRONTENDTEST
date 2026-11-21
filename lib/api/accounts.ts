/**
 * Registration and account-management endpoints added by the backend's school
 * and role work (backend develop 9fd1942). Each one is used only when the
 * backend advertises the matching capability (GET /api/v1) and, for staff
 * routes, when the caller holds the permission; the backend enforces both.
 *
 * - School directory (public): GET /schools/search, GET /schools/locations
 * - The student's school claim: GET/POST /me/school-affiliation (STUDENT)
 * - Claim review: /admin/school-affiliations (schools.manage)
 * - Teacher schools and delegations: /admin/teacher-assignments, /admin/teachers/:id/delegations (users.manageTeachers)
 */
import { api, type QueryValue } from "./client";
import type { GradeLevel, Page } from "./types";
import type { ItemOutcome, ItemResult, StudentScope } from "../accounts/teacher-student-access";
import type { TeacherSchoolRole } from "../schools/primary-teacher";

// ─── School directory (public) ──────────────────────────────────────────────

/** `GET /schools/search` row (new backend): active official Rwandan schools only. */
export interface DirectorySchool {
  id: string;
  /**
   * The official 6-digit code, or null for a school without one (owner decision
   * 2026-11-14: such schools are searchable and chosen by `id`; only backends
   * that support this return them, so older backends always send a code).
   */
  code: string | null;
  name: string;
  location: string;
  district: string | null;
  sector: string | null;
  /** Newer backends add the school's province (additive; absent on older ones). */
  province?: string | null;
}

/** `GET /schools/locations`: the official province → district → sector list. */
export interface SchoolProvince {
  province: string;
  districts: { district: string; sectors: string[] }[];
}

export const schoolDirectoryApi = {
  /** `q` (2–100, name or code prefix), or a district / sector filter. Up to 10 results (200 when filtered). */
  /** `teacherEligible`: only schools a Teacher may choose (official code, or administrator-created and verified). */
  search: (params: { q?: string; province?: string; district?: string; sector?: string; teacherEligible?: "true" }) =>
    api<DirectorySchool[]>("/schools/search", { query: params, auth: false }),
  locations: () => api<SchoolProvince[]>("/schools/locations", { auth: false }),
};

// ─── School claims ──────────────────────────────────────────────────────────

export type AffiliationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";

/** Exactly one of the shapes the backend accepts. */
export type SchoolClaimInput =
  | { schoolCode: string }
  | { schoolId: string }
  | { schoolName: string; schoolProvince: string; schoolDistrict: string; schoolSector: string }
  | { country: string; schoolName: string };

export interface MySchoolAffiliation {
  current: {
    status: AffiliationStatus;
    school: { id: string; code: string | null; name: string; location: string } | null;
    claimedName: string | null;
    claimedCountry: string | null;
    submittedAt: string;
    decidedAt: string | null;
    /** Set only for REJECTED and REVOKED. */
    reason: string | null;
  } | null;
}

export const myAffiliationApi = {
  get: () => api<MySchoolAffiliation>("/me/school-affiliation"),
  claim: (input: SchoolClaimInput) => api<MySchoolAffiliation>("/me/school-affiliation", { method: "POST", body: input }),
};

/** `/admin/school-affiliations` rows. */
export interface SchoolAffiliation {
  id: string;
  status: AffiliationStatus;
  source: string;
  createdAt: string;
  claimedName: string | null;
  claimedCountry: string | null;
  claimedProvince: string | null;
  claimedDistrict: string | null;
  claimedSector: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  supersededAt: string | null;
  student: { id: string; username: string; firstName: string; lastName: string; gradeLevel: GradeLevel | null; division: { id: string; name: string } | null };
  school: { id: string; code: string | null; name: string; location: string } | null;
}

export interface AffiliationCandidate {
  id: string;
  name: string;
  code: string | null;
  countryCode: string;
  province: string | null;
  district: string | null;
  sector: string | null;
  isActive: boolean;
}

export interface AffiliationFilters {
  status?: AffiliationStatus;
  hasSchool?: boolean;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

const post = <T>(path: string, body: object) => api<T>(path, { method: "POST", body });

export const affiliationsAdminApi = {
  list: (filters: AffiliationFilters = {}) => api<Page<SchoolAffiliation>>("/admin/school-affiliations", { query: filters }),
  /** Up to 20 schools whose normalised name matches a name-only claim (same country; same district when known). */
  candidates: (id: string) => api<AffiliationCandidate[]>(`/admin/school-affiliations/${id}/candidates`),
  verify: (id: string, note?: string) => post<SchoolAffiliation>(`/admin/school-affiliations/${id}/verify`, note ? { note } : {}),
  /** The reason is shown to the student. */
  reject: (id: string, reason: string) => post<SchoolAffiliation>(`/admin/school-affiliations/${id}/reject`, { reason }),
  revoke: (id: string, reason: string) => post<SchoolAffiliation>(`/admin/school-affiliations/${id}/revoke`, { reason }),
  reopen: (id: string, reason: string) => post<SchoolAffiliation>(`/admin/school-affiliations/${id}/reopen`, { reason }),
  /** Link a name-only claim to a school (it stays PENDING). Repeat with confirmDifferentPlace after SCHOOL_PLACE_MISMATCH. */
  match: (id: string, input: { schoolId: string; note?: string; confirmDifferentPlace?: boolean }) =>
    post<SchoolAffiliation>(`/admin/school-affiliations/${id}/match`, input),
};

// ─── Teachers ───────────────────────────────────────────────────────────────

export interface TeacherSchoolAssignment {
  id: string;
  isActive: boolean;
  /** Backends with primaryTeacher: PRIMARY (the school's main contact) or SECONDARY — the same rights either way. */
  role?: TeacherSchoolRole;
  createdAt: string;
  endedAt: string | null;
  teacher: { id: string; username: string; firstName: string; lastName: string };
  school: { id: string; name: string; location: string };
  assignedBy: { id: string; username: string } | null;
  endedBy: { id: string; username: string } | null;
}

export const TEACHER_DELEGATIONS = ["students.viewProfile", "students.viewProgress", "submissions.submitOnBehalf"] as const;
export type TeacherDelegation = (typeof TEACHER_DELEGATIONS)[number];

export interface DelegationRow {
  id: string;
  permission: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  createdBy: { id: string; username: string } | null;
  active: boolean;
  /** Backends with teacherStudentAccess: which students it covers; the listed students of a SELECTED one; TS-5 flag. */
  studentScope?: StudentScope | null;
  students?: Array<{ studentId: string; createdAt: string; student: PersonRef }>;
  reviewNeededAt?: string | null;
  reviewReason?: string | null;
}

export interface PersonRef { id: string; username: string; firstName: string; lastName: string }

/** An explicit teacher–student assignment (TS-2, TS-3). */
export interface TeacherStudentAssignment {
  id: string;
  isActive: boolean;
  source: "ADMIN" | "BULK";
  crossSchool: boolean;
  reason: string | null;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
  teacher: PersonRef;
  student: PersonRef & { gradeLevel: GradeLevel | null; school: { id: string; name: string } | null };
  assignedBy: { id: string; username: string } | null;
  endedBy: { id: string; username: string } | null;
}

export interface BatchResult { counts: Partial<Record<ItemOutcome, number>>; results: ItemResult[] }

/** GET /admin/schools/:id/access */
export interface SchoolAccess {
  school: { id: string; name: string; location: string; isActive: boolean };
  teachers: Array<{
    teacherSchoolAssignmentId: string;
    since: string;
    /** Backends with primaryTeacher. */
    role?: TeacherSchoolRole;
    teacher: PersonRef & { accountStatus: string };
    assignedStudents: number;
    delegations: Array<{ id: string; permission: string; studentScope: StudentScope | null; expiresAt: string | null; reviewNeededAt: string | null; reviewReason: string | null; selectedStudents: number | null }>;
  }>;
  counts: { verifiedStudents: number; pendingStudents: number; verifiedWithoutTeacher: number };
  attention: { delegationsNeedingReview: Array<{ teacherId: string; overrideId: string; permission: string; reviewReason: string | null }> };
}

/** GET /admin/schools/:id/access/students — never contact data. */
export interface SchoolAccessStudent extends PersonRef {
  gradeLevel: GradeLevel | null;
  accountStatus: string;
  isApproved: boolean;
  activated: boolean;
  claim: { id: string; status: "VERIFIED" | "PENDING" } | null;
  teachers: Array<PersonRef & { assignmentId: string; crossSchool: boolean }>;
}

export interface SchoolAccessStudentFilters {
  q?: string;
  gradeLevel?: GradeLevel;
  verification?: "VERIFIED" | "PENDING";
  assigned?: boolean;
  teacherId?: string;
  page?: number;
  limit?: number;
}

export const DELEGATION_RULES = { reasonMin: 3, reasonMax: 500 };

export const teachersAdminApi = {
  assignments: (teacherId: string) =>
    api<Page<TeacherSchoolAssignment>>("/admin/teacher-assignments", { query: { teacherId, limit: 100 } }),
  /** A school's Teacher assignments (INT-07): names only, never contact details. */
  bySchool: (schoolId: string, q: { page?: number; isActive?: boolean } = {}) =>
    api<Page<TeacherSchoolAssignment>>("/admin/teacher-assignments", { query: { schoolId, page: q.page ?? 1, limit: 20, ...(q.isActive !== undefined && { isActive: q.isActive }) } }),
  /** The school's active primary teacher link, or none (backends with primaryTeacher). */
  primaryOf: (schoolId: string) =>
    api<Page<TeacherSchoolAssignment>>("/admin/teacher-assignments", { query: { schoolId, isActive: true, role: "PRIMARY", limit: 1 } }).then((p) => p.data[0] ?? null),
  /** Make this teacher the school's primary teacher; the previous one becomes secondary (users.manageTeachers). */
  makePrimary: (assignmentId: string) => post<TeacherSchoolAssignment>(`/admin/teacher-assignments/${assignmentId}/primary`, {}),
  assign: (teacherId: string, schoolId: string) => post<TeacherSchoolAssignment>("/admin/teacher-assignments", { teacherId, schoolId }),
  endAssignment: (id: string) => api<TeacherSchoolAssignment>(`/admin/teacher-assignments/${id}`, { method: "DELETE" }),
  delegations: (teacherId: string) => api<DelegationRow[]>(`/admin/teachers/${teacherId}/delegations`),
  grant: (teacherId: string, input: { permission: TeacherDelegation; reason: string; expiresAt?: string; studentScope?: StudentScope; studentIds?: string[] }) =>
    post<DelegationRow>(`/admin/teachers/${teacherId}/delegations`, input),
  addDelegationStudents: (teacherId: string, overrideId: string, studentIds: string[]) =>
    post<BatchResult & { overrideId: string }>(`/admin/teachers/${teacherId}/delegations/${overrideId}/students`, { studentIds }),
  removeDelegationStudent: (teacherId: string, overrideId: string, studentId: string) =>
    api<ItemResult>(`/admin/teachers/${teacherId}/delegations/${overrideId}/students/${studentId}`, { method: "DELETE" }),
  markReviewed: (teacherId: string, overrideId: string) => post<{ overrideId: string }>(`/admin/teachers/${teacherId}/delegations/${overrideId}/reviewed`, {}),
  /** Teacher–student assignments (teacherStudentAccess). */
  studentAssignments: (filters: { teacherId?: string; studentId?: string; schoolId?: string; isActive?: boolean; limit?: number; page?: number }) =>
    api<Page<TeacherStudentAssignment>>("/admin/teacher-students", { query: filters }),
  assignStudents: (teacherId: string, studentIds: string[], reason?: string) =>
    post<BatchResult & { teacherId: string }>("/admin/teacher-students", { teacherId, studentIds, ...(reason && { reason }) }),
  endStudentAssignment: (id: string) => api<TeacherStudentAssignment>(`/admin/teacher-students/${id}`, { method: "DELETE" }),
  reassignStudents: (fromTeacherId: string, toTeacherId: string, studentIds: string[], reason?: string) =>
    post<BatchResult>("/admin/teacher-students/reassign", { fromTeacherId, toTeacherId, studentIds, ...(reason && { reason }) }),
  schoolAccess: (schoolId: string) => api<SchoolAccess>(`/admin/schools/${schoolId}/access`),
  schoolAccessStudents: (schoolId: string, filters: SchoolAccessStudentFilters) =>
    api<Page<SchoolAccessStudent>>(`/admin/schools/${schoolId}/access/students`, { query: filters as Record<string, QueryValue> }),
  revoke: (teacherId: string, overrideId: string) => api<DelegationRow>(`/admin/teachers/${teacherId}/delegations/${overrideId}`, { method: "DELETE" }),
};
