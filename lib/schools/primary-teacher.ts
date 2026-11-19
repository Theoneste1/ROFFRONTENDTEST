/**
 * Primary teacher of a school (owner decision 2026-11-19). The primary teacher is the school's designated MAIN CONTACT
 * only: primary and secondary teachers have exactly the same rights. At most one active primary per school; a school
 * can have none (when the primary's link ends or their account is no longer active — nobody is promoted automatically,
 * an Administrator chooses the next one with "Make primary").
 *
 * Backends advertising `primaryTeacher` send `role` on teacher–school links; older ones send nothing and no badge is
 * shown. Pure; tested in tests/primary-teacher.test.mjs.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";

export type TeacherSchoolRole = "PRIMARY" | "SECONDARY";

export const NO_PRIMARY_TEACHER = "No primary teacher";

export const TEACHER_ROLE_LABEL: Record<TeacherSchoolRole, string> = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
};

/** Badge colours (WCAG AA on their background): indigo-700 on indigo-50, gray-700 on gray-100. */
export const TEACHER_ROLE_BADGE: Record<TeacherSchoolRole, string> = {
  PRIMARY: "bg-indigo-50 text-indigo-700",
  SECONDARY: "bg-gray-100 text-gray-700",
};

export const TEACHER_ROLE_HINT: Record<TeacherSchoolRole, string> = {
  PRIMARY: "The school's main contact. Same rights as the school's other teachers.",
  SECONDARY: "A teacher of the school. Same rights as the primary teacher.",
};

export function primaryTeacherSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "primaryTeacher");
}

/** The role to show for a link, or null (an ended link, or a backend without the feature). */
export function displayedRole(a: { isActive: boolean; role?: TeacherSchoolRole | null }): TeacherSchoolRole | null {
  if (!a.isActive || !a.role) return null;
  return a.role;
}

/** "Make primary" is offered for an active secondary link, to users.manageTeachers only. */
export function canMakePrimary(a: { isActive: boolean; role?: TeacherSchoolRole | null }, canManageTeachers: boolean): boolean {
  return canManageTeachers && a.isActive && a.role === "SECONDARY";
}

/** The confirm text: who becomes primary, and who stops being primary (if anyone). */
export function makePrimaryText(next: string, current: string | null, school: string): string {
  const head = `${next} becomes the primary teacher (main contact) of ${school}.`;
  const tail = current ? ` ${current} becomes a secondary teacher.` : "";
  return `${head}${tail} Permissions do not change: every teacher of the school keeps the same rights.`;
}

/** The school's primary teacher line. */
export function primaryTeacherLine(primary: { firstName: string; lastName: string } | null | undefined): string {
  return primary ? `${primary.firstName} ${primary.lastName}`.trim() : NO_PRIMARY_TEACHER;
}
