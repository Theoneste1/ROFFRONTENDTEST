/**
 * Pure rules for the programme screens (Head Coach monitoring, programme
 * membership, coach course access). No React; tested in tests/programmes.test.mjs.
 *
 * Every rule mirrors a backend rule (ROFBACKENDTEST src/programmes/programmes.service.ts,
 * src/mentor-assignments/mentor-assignments.service.ts). Hiding is a courtesy:
 * the backend refuses anything not permitted.
 */
import type { CourseParticipationRow, CourseRef, DivisionRef, Permission, Role } from "../api/types";
import { isAdministrative } from "../auth/role-rules";

type Can = (permission: Permission) => boolean;
export type MemberRole = "STUDENT" | "MENTOR";

/** The backend's "Administrator authority" (isAdmin): ADMIN or SUPER_ADMIN. */
const isAdministrator = isAdministrative;

/**
 * Whose programme membership the caller may add or end (programmes.manageMembers):
 * administrators students and coaches; a Head Coach students only (coaches → 403).
 */
export function memberRolesManaged(role: Role | string | null | undefined, can: Can): MemberRole[] {
  if (!can("programmes.manageMembers")) return [];
  if (isAdministrator(role)) return ["STUDENT", "MENTOR"];
  if (role === "HEAD_COACH") return ["STUDENT"];
  return [];
}

/**
 * Finding a person to add needs a user search the caller is allowed to run.
 * The only one is GET /admin/users (users.manage: administrators). A Head Coach's
 * users.view is not used by any route, so a Head Coach can only add back someone
 * whose id the page already holds (a membership they just ended).
 */
export const canSearchPeople = (can: Can): boolean => can("users.manage");

export type CourseAccessTarget = "coach" | "headCoach" | "notEligible";

/**
 * Whose course × division access the caller may give (POST /admin/mentor-assignments,
 * mentorAssignments.manage):
 *  - a Coach (MENTOR): any caller holding mentorAssignments.manage (a Head Coach only for
 *    members of a programme they head, on that programme's courses — the backend checks);
 *  - a Head Coach: an Administrator only (H4), and only on courses of a programme that
 *    Head Coach heads (400 NOT_PROGRAMME_HEAD otherwise);
 *  - anyone else: nobody.
 */
export function courseAccessTarget(callerRole: Role | string | null | undefined, can: Can, targetRole: Role | string | null | undefined): CourseAccessTarget {
  if (!can("mentorAssignments.manage")) return "notEligible";
  if (targetRole === "MENTOR") return "coach";
  if (targetRole === "HEAD_COACH" && isAdministrator(callerRole)) return "headCoach";
  return "notEligible";
}

/** Readable text for the backend's refusals of a course-access change. */
export function courseAccessError(code: string | undefined, status: number | undefined): string | null {
  if (code === "NOT_PROGRAMME_HEAD") return "A Head Coach can only be given courses of a programme they head. Make them head of that course's programme first.";
  if (code === "SCOPE_FORBIDDEN") return "Head Coaches give course access to coaches only — never to themselves, another Head Coach or an administrator.";
  if (code === "NOT_A_MENTOR") return "Only coaches, or Head Coaches (by an administrator), can be given course access.";
  if (code === "ACCOUNT_SUSPENDED") return "This coach account is suspended.";
  if (status === 404) return "That coach or course is not in a programme you head (the coach must be a member of the course's programme).";
  return null;
}

/** Readable text for the backend's refusals of a membership change. */
export function membershipError(code: string | undefined, status: number | undefined): string | null {
  if (code === "ALREADY_MEMBER") return "Already an active member of this programme.";
  if (code === "MEMBERSHIP_ENDED") return "This membership has already ended.";
  if (code === "ROLE_NOT_MEMBER") return "Only students and coaches are programme members; Head Coaches are set as programme heads.";
  if (code === "SCOPE_FORBIDDEN") return "Coaches join a programme through an administrator.";
  if (status === 404) return "That person or programme is not available to you.";
  return null;
}

export interface ProgrammeCourse {
  course: CourseRef;
  divisions: { division: DivisionRef; students: number; opened: number; submissions: number; assignmentsPublished: number }[];
  students: number;
  opened: number;
  submissions: number;
}

/**
 * The courses of the caller's programmes, from GET /admin/reports/course-participation
 * (reports.view; the backend limits a Head Coach to the programmes they head and lists
 * every course × division of them). Order: the report's (course sort order).
 */
export function programmeCourses(rows: readonly CourseParticipationRow[]): ProgrammeCourse[] {
  const byId = new Map<string, ProgrammeCourse>();
  for (const r of rows) {
    let c = byId.get(r.course.id);
    if (!c) {
      c = { course: r.course, divisions: [], students: 0, opened: 0, submissions: 0 };
      byId.set(r.course.id, c);
    }
    c.divisions.push({ division: r.division, students: r.students, opened: r.opened, submissions: r.submissions, assignmentsPublished: r.assignmentsPublished });
    c.students += r.students;
    c.opened += r.opened;
    c.submissions += r.submissions;
  }
  return [...byId.values()];
}

/** The divisions named in the report rows (each once, in first-seen order). */
export function reportDivisions(rows: readonly CourseParticipationRow[]): DivisionRef[] {
  const seen = new Map<string, DivisionRef>();
  for (const r of rows) if (!seen.has(r.division.id)) seen.set(r.division.id, r.division);
  return [...seen.values()];
}

export const ACTIVITY_LABEL: Record<string, string> = {
  LOGIN: "Sign-ins",
  COURSE_OPENED: "Courses opened",
  COURSE_COMPLETED: "Courses completed",
  RESOURCE_VIEWED: "Resources viewed",
  ASSIGNMENT_VIEWED: "Assignments viewed",
  SUBMISSION_CREATED: "Submissions",
  SUBMISSION_RESUBMITTED: "Resubmissions",
  RESULT_VIEWED: "Results viewed",
  THREAD_CREATED: "Discussions started",
  COMMENT_POSTED: "Comments",
};

/** One activity row, as an event. */
export const ACTIVITY_EVENT: Record<string, string> = {
  LOGIN: "Signed in",
  COURSE_OPENED: "Opened a course",
  COURSE_COMPLETED: "Completed a course",
  RESOURCE_VIEWED: "Viewed a resource",
  ASSIGNMENT_VIEWED: "Viewed an assignment",
  SUBMISSION_CREATED: "Submitted work",
  SUBMISSION_RESUBMITTED: "Resubmitted work",
  RESULT_VIEWED: "Viewed a result",
  THREAD_CREATED: "Started a discussion",
  COMMENT_POSTED: "Posted a comment",
};

/** Activity counts per type, largest first; unknown types keep their code as label. */
export function activityBreakdown(byType: Readonly<Record<string, number>>): { type: string; label: string; count: number }[] {
  return Object.entries(byType)
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, label: ACTIVITY_LABEL[type] ?? type, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
