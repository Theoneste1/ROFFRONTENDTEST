/**
 * Academic years and student enrolment (backend src/academic-years; identical on
 * the production `main` and `develop` backends apart from guard metadata).
 *
 *   GET   /academic-years                         any signed-in user — every year, newest first
 *   POST  /admin/academic-years                   academicYears.manage — plan a year (PLANNED)
 *   PATCH /admin/academic-years/:id               academicYears.manage — edit (not CLOSED)
 *   POST  /admin/academic-years/:id/activate      academicYears.manage — start a PLANNED year
 *   GET   /admin/academic-years/:id/enrollments   academicYears.manage — the year's enrolments
 *   PATCH /admin/enrollments/:id                  enrollments.manage — correct grade / withdraw
 *
 * Exactly one year is current (DB-enforced). Without one, student registration
 * and student creation fail (409 NO_CURRENT_ACADEMIC_YEAR).
 */
import { api, type QueryValue } from "./client";
import type { GradeLevel, Page } from "./types";

export type AcademicYearStatus = "PLANNED" | "ACTIVE" | "CLOSED";
export type EnrollmentStatus = "ACTIVE" | "PROMOTED" | "GRADUATED" | "WITHDRAWN";

export interface AcademicYear {
  id: string;
  name: string;
  /** Dates are calendar days (`@db.Date`), serialised as `YYYY-MM-DDT00:00:00.000Z`. */
  startsOn: string;
  endsOn: string;
  status: AcademicYearStatus;
  isCurrent: boolean | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { enrollments: number; assignments: number };
}

export interface ActivationResult {
  academicYear: AcademicYear;
  promoted: number;
  carriedOver: number;
  graduated: number;
  newlyEnrolled: number;
  assignmentsArchived: number;
  /** True when this answers a repeated start: the year had already been started with the same choices. */
  replayed?: boolean;
}

export interface Enrollment {
  id: string;
  studentId: string;
  academicYearId: string;
  gradeLevel: GradeLevel;
  divisionId: string;
  schoolId: string | null;
  status: EnrollmentStatus;
  endedAt: string | null;
  student: { id: string; firstName: string; lastName: string; username: string; isActive: boolean };
  division: { id: string; code: string; name: string };
  school: { id: string; name: string } | null;
}

export interface EnrollmentFilters {
  gradeLevel?: GradeLevel;
  status?: EnrollmentStatus;
  divisionId?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export const academicYearsApi = {
  list: () => api<AcademicYear[]>("/academic-years"),
  create: (input: { name: string; startsOn: string; endsOn: string }) => api<AcademicYear>("/admin/academic-years", { method: "POST", body: input }),
  update: (id: string, input: { name?: string; startsOn?: string; endsOn?: string }) => api<AcademicYear>(`/admin/academic-years/${id}`, { method: "PATCH", body: input }),
  /**
   * `expectedCurrentYearId` (backends with `academicYearActivation` only; the original backend
   * refuses unknown fields): the year this page shows as current, or null for none. The backend
   * refuses the start (409 CURRENT_YEAR_CHANGED) when another start has changed it meanwhile.
   */
  activate: (id: string, input: { promoteStudents: boolean; deactivateGraduates?: boolean; expectedCurrentYearId?: string | null }) =>
    api<ActivationResult>(`/admin/academic-years/${id}/activate`, { method: "POST", body: input }),
  enrollments: (id: string, filters: EnrollmentFilters = {}) => api<Page<Enrollment>>(`/admin/academic-years/${id}/enrollments`, { query: filters }),
  updateEnrollment: (id: string, input: { gradeLevel: GradeLevel } | { status: "WITHDRAWN" }) =>
    api<Enrollment>(`/admin/enrollments/${id}`, { method: "PATCH", body: input }),
};
