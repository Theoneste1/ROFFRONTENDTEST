/**
 * Teacher self-registration (owner-approved design): a public application that an Administrator
 * reviews. Nothing — no account, no school assignment, no school record — exists until approval.
 *
 *   GET  /auth/register/teacher/availability          public  { open }
 *   POST /auth/register/teacher                       public  the application (201)
 *   GET  /admin/teacher-applications                  users.manageTeachers  paginated list
 *   GET  /admin/teacher-applications/:id              users.manageTeachers
 *   POST /admin/teacher-applications/:id/school       users.manageTeachers  { schoolId, note? } — verify a missing school
 *   POST /admin/teacher-applications/:id/approve      users.manageTeachers  { schoolId?, note? }
 *   POST /admin/teacher-applications/:id/reject       users.manageTeachers  { reason }
 *
 * Only on a backend advertising `teacherSelfRegistration` (GET /api/v1). Whether registration
 * is currently open comes from the availability endpoint.
 */
import { api } from "./client";
import type { Page } from "./types";

export type OlympiadSubject = "MATHEMATICS" | "COMPUTING" | "PHYSICS";
export type TeacherApplicationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface TeacherRegistrationAvailability {
  open: boolean;
}

/**
 * `POST /auth/register/teacher`. Exactly one school shape: a listed school (`schoolId`, with its
 * province and district) or a missing one (`proposedSchoolName` + province / district / sector).
 * The school's code, sector or name are never sent for a listed school (the backend reads them).
 */
export interface TeacherRegistrationBase {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  phone: string;
  olympiadInterests: OlympiadSubject[];
  schoolProvince: string;
  schoolDistrict: string;
  homeDistrict: string;
  homeSector: string;
}
export type TeacherRegistrationInput =
  | (TeacherRegistrationBase & { schoolId: string })
  | (TeacherRegistrationBase & { proposedSchoolName: string; schoolSector: string });

export interface TeacherApplicationSchool {
  id: string;
  name: string;
  code: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
}

/** 201 answer. */
export interface TeacherRegistrationResult {
  id: string;
  status: "PENDING";
  requiresApproval: true;
  school: TeacherApplicationSchool | null;
  proposedSchoolName: string | null;
}

/** The application as the admin routes return it (never the password). */
export interface TeacherApplication {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  country: string;
  olympiadInterests: string[];
  status: TeacherApplicationStatus;
  school: TeacherApplicationSchool | null;
  proposedSchoolName: string | null;
  schoolProvince: string | null;
  schoolDistrict: string | null;
  schoolSector: string | null;
  homeDistrict: string | null;
  homeSector: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: { id: string; firstName: string; lastName: string } | null;
  rejectionReason: string | null;
  decisionNote: string | null;
  userId: string | null;
  assignedSchool: { id: string; name: string; code: string | null } | null;
  /**
   * When an Administrator verified a missing school (POST …/:id/school): the official school is
   * then in `school`. Null for a listed school and while not yet verified. Optional so an older
   * backend without the field still type-checks (treated as not verified).
   */
  schoolVerifiedAt?: string | null;
  schoolVerifiedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface TeacherApplicationFilters {
  status?: TeacherApplicationStatus;
  page?: number;
  limit?: number;
}

export interface ApproveTeacherApplicationResult {
  application: TeacherApplication;
  teacher: { id: string; firstName: string; lastName: string; username: string; email: string; role: string };
  emailVerificationRequired: boolean;
}

export const teacherRegistrationApi = {
  availability: () => api<TeacherRegistrationAvailability>("/auth/register/teacher/availability", { auth: false }),
  /** 403 REGISTRATION_CLOSED while closed; 409 IDENTITY_TAKEN; 400 with a code for school / place / phone problems. */
  register: (input: TeacherRegistrationInput) =>
    api<TeacherRegistrationResult>("/auth/register/teacher", { method: "POST", body: input, auth: false }),
};

export const teacherApplicationsAdminApi = {
  list: (filters: TeacherApplicationFilters = {}) =>
    api<Page<TeacherApplication>>("/admin/teacher-applications", { query: { ...filters } }),
  get: (id: string) => api<TeacherApplication>(`/admin/teacher-applications/${encodeURIComponent(id)}`),
  /**
   * Verify a missing-school application's school (an existing official school). Keeps the
   * application PENDING (no account); the applicant is e-mailed that the school was verified.
   * 409 SCHOOL_ALREADY_VERIFIED / APPLICATION_ALREADY_DECIDED; 400 UNKNOWN_SCHOOL.
   */
  verifySchool: (id: string, input: { schoolId: string; note?: string }) =>
    api<TeacherApplication>(`/admin/teacher-applications/${encodeURIComponent(id)}/school`, { method: "POST", body: input }),
  /** 400 SCHOOL_NOT_VERIFIED (missing school not verified yet) / SCHOOL_MISMATCH; 409 APPLICATION_ALREADY_DECIDED. */
  approve: (id: string, input: { schoolId?: string; note?: string }) =>
    api<ApproveTeacherApplicationResult>(`/admin/teacher-applications/${encodeURIComponent(id)}/approve`, { method: "POST", body: input }),
  reject: (id: string, reason: string) =>
    api<TeacherApplication>(`/admin/teacher-applications/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reason } }),
};
