/**
 * My Assignments list: where the status filter and the sort run.
 *
 * - **server** (backend feature `studentAssignmentFilters`): `progress` and `sort` go to
 *   GET /me/assignments, so paging and totals count only the matches.
 * - **legacy** (older backends refuse those parameters): the page is loaded unfiltered and the
 *   filter/sort apply to the loaded page only; the page says so.
 */
import type { StudentStatusFilter } from "./student-state";

export type MyAssignmentsSort = "deadline-asc" | "deadline-desc" | "title";
export type Progress = "NOT_STARTED" | "SUBMITTED" | "PENDING_REVIEW" | "RESUBMISSION_REQUESTED" | "REVIEWED" | "OVERDUE";

const PROGRESS: Record<Exclude<StudentStatusFilter, "all">, Progress> = {
  "Not Started": "NOT_STARTED",
  Submitted: "SUBMITTED",
  "Pending Review": "PENDING_REVIEW",
  "Resubmission Requested": "RESUBMISSION_REQUESTED",
  Reviewed: "REVIEWED",
  Overdue: "OVERDUE",
};
const SORT: Record<MyAssignmentsSort, "deadline" | "-deadline" | "title"> = {
  "deadline-asc": "deadline",
  "deadline-desc": "-deadline",
  title: "title",
};

/** Extra query parameters for the server mode (nothing in legacy mode). */
export function serverListParams(status: StudentStatusFilter, sort: MyAssignmentsSort): { progress?: Progress; sort?: "-deadline" | "title" } {
  const s = SORT[sort];
  return {
    ...(status !== "all" && { progress: PROGRESS[status] }),
    ...(s !== "deadline" && { sort: s }), // deadline is the server default
  };
}

/** Local day boundaries for the dashboard widgets (stable within a day, so query keys stay stable). */
export function dayStart(now: number, offsetDays = 0): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

/** The month shown by the deadline calendar, as a deadline window [first day, first day of next month). */
export function monthWindow(cursor: Date): { deadlineFrom: string; deadlineTo: string } {
  const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  to.setMilliseconds(-1);
  return { deadlineFrom: from.toISOString(), deadlineTo: to.toISOString() };
}
