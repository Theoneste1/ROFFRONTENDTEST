/**
 * Teachers of a school (INT-07) on the administrators' school page: who may see the tab, the filter and the period
 * text. The list comes from GET /admin/teacher-assignments?schoolId= (users.manageTeachers): names and usernames,
 * never contact details. Pure; tested in tests/school-teachers.test.mjs.
 */
import type { Permission } from "../api/types";

export const SCHOOL_TEACHERS_PERMISSION: Permission = "users.manageTeachers";

export type SchoolTeacherFilter = "current" | "ended" | "all";

export const SCHOOL_TEACHER_FILTERS: readonly { label: string; value: SchoolTeacherFilter }[] = [
  { label: "Current", value: "current" },
  { label: "Ended", value: "ended" },
  { label: "All", value: "all" },
];

/** The tab is offered only to users who hold users.manageTeachers (the API refuses everyone else). */
export const schoolTeachersVisible = (can: (p: Permission) => boolean) => can(SCHOOL_TEACHERS_PERMISSION);

/** "Since 3 Nov 2026" for a current assignment; "3 Nov 2026 – 1 Dec 2026" for an ended one. */
export function assignmentPeriod(a: { isActive: boolean; createdAt: string; endedAt: string | null }, fmt: (iso: string) => string): string {
  if (a.isActive || !a.endedAt) return `Since ${fmt(a.createdAt)}`;
  return `${fmt(a.createdAt)} – ${fmt(a.endedAt)}`;
}
