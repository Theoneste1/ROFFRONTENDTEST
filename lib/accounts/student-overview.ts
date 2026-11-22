/**
 * The Student Profile Overview (capability studentOverview, owner 2026-11-22): `GET /students/:id/overview`.
 * Basic information (photo, name, username, country, school, grade, Olympiad level, subjects) for everyone allowed to
 * view the student — the student, other active students, the teachers of the student's school, the coaches of their
 * programmes or division, and administrators. The account status comes for staff only. Phones, family contacts and
 * the date of birth are never part of it. Pure helpers tested in tests/student-overview.test.mjs.
 */
import { api } from "../api/client";
import type { GradeLevel } from "../api/types";
import { portalPrefix } from "../auth/role-rules";

export interface StudentOverview {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  country: string | null;
  school: { id: string; name: string } | null;
  gradeLevel: GradeLevel | null;
  olympiadLevel: { id: string; code: string; name: string } | null;
  olympiadInterests: string[] | null;
  olympiadInterestOther: string | null;
  /** Staff only. */
  accountStatus?: "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "ARCHIVED";
}

export const studentOverviewApi = {
  get: (id: string) => api<StudentOverview>(`/students/${id}/overview`),
};

/** The profile page of a student for the viewer's portal (`/admin/profiles/:id`, …); null for an unknown role. */
export function studentProfileHref(viewerRole: string | null | undefined, studentId: string): string | null {
  const prefix = portalPrefix(viewerRole);
  return prefix ? `${prefix}/profiles/${encodeURIComponent(studentId)}` : null;
}

const STATUS_TEXT: Record<string, string> = { ACTIVE: "Active", DEACTIVATED: "Deactivated", SUSPENDED: "Suspended", ARCHIVED: "Archived" };
export function accountStatusText(status: string | null | undefined): string | null {
  return status ? STATUS_TEXT[status] ?? status : null;
}
