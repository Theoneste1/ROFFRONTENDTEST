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

// ─── School directory (public) ──────────────────────────────────────────────

/** `GET /schools/search` row (new backend): active official Rwandan schools only. */
export interface DirectorySchool {
  id: string;
  code: string;
  name: string;
  location: string;
  district: string | null;
  sector: string | null;
}

/** `GET /schools/locations`: the official province → district → sector list. */
export interface SchoolProvince {
  province: string;
  districts: { district: string; sectors: string[] }[];
}

export const schoolDirectoryApi = {
  /** `q` (2–100, name or code prefix), or a district / sector filter. Up to 10 results (200 when filtered). */
  search: (params: { q?: string; province?: string; district?: string; sector?: string }) =>
    api<DirectorySchool[]>("/schools/search", { query: params, auth: false }),
  locations: () => api<SchoolProvince[]>("/schools/locations", { auth: false }),
};

// ─── School claims ──────────────────────────────────────────────────────────

export type AffiliationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";

/** Exactly one of the three shapes the backend accepts. */
export type SchoolClaimInput =
  | { schoolCode: string }
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
}

export const DELEGATION_RULES = { reasonMin: 3, reasonMax: 500 };

export const teachersAdminApi = {
  assignments: (teacherId: string) =>
    api<Page<TeacherSchoolAssignment>>("/admin/teacher-assignments", { query: { teacherId, limit: 100 } }),
  assign: (teacherId: string, schoolId: string) => post<TeacherSchoolAssignment>("/admin/teacher-assignments", { teacherId, schoolId }),
  endAssignment: (id: string) => api<TeacherSchoolAssignment>(`/admin/teacher-assignments/${id}`, { method: "DELETE" }),
  delegations: (teacherId: string) => api<DelegationRow[]>(`/admin/teachers/${teacherId}/delegations`),
  grant: (teacherId: string, input: { permission: TeacherDelegation; reason: string; expiresAt?: string }) =>
    post<DelegationRow>(`/admin/teachers/${teacherId}/delegations`, input),
  revoke: (teacherId: string, overrideId: string) => api<DelegationRow>(`/admin/teachers/${teacherId}/delegations/${overrideId}`, { method: "DELETE" }),
};
