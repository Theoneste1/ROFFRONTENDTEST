/**
 * The coach's per-assignment review list (`GET /mentor/reviews?assignmentId=`), in two modes:
 *
 * - **server** (backend advertises `reviewQueueFilters`): search, status group, sort, totals and
 *   pagination run in the database — every submission is reachable, however many there are (M2).
 * - **legacy** (older backends, which refuse the new parameters): one page of up to 100, filtered,
 *   sorted and counted in the browser — the previous behaviour, kept unchanged.
 *
 * Pure functions (no React), tested in tests/review-queue.test.mjs.
 */
import type { ReviewFilters } from "../api/mentor";
import type { ReviewSubmission, SubmissionStatus } from "../api/types";

export interface ReviewControls {
  search: string;
  /** "all" | "open" | "done" | a SubmissionStatus */
  status: string;
  sort: "submitted" | "name" | "score";
}

export const REVIEW_PAGE_SIZE = 25;
/** The legacy mode's single page (the backend maximum). */
export const LEGACY_LIMIT = 100;

/** Same groups as the backend (src/submissions/review-queue.ts). */
export const OPEN_STATUSES: readonly SubmissionStatus[] = ["ASSIGNED", "IN_REVIEW", "MARKED", "REJECTED", "RESUBMISSION_REQUESTED"];
export const DONE_STATUSES: readonly SubmissionStatus[] = ["SUBMITTED_TO_ADMIN", "APPROVED", "PUBLISHED"];

/** Server mode: the query for one page. The page's "Submitted date" sort shows the newest first. */
export function serverQuery(assignmentId: string, controls: ReviewControls, page: number): ReviewFilters {
  const q = controls.search.trim();
  const s = controls.status;
  const byStatus: Pick<ReviewFilters, "group" | "status"> =
    s === "all" || s === "open" || s === "done" ? { group: s } : { status: s as SubmissionStatus };
  return {
    assignmentId,
    ...byStatus,
    ...(q && { q: q.slice(0, 100) }),
    sort: controls.sort === "submitted" ? "recent" : controls.sort,
    page,
    limit: REVIEW_PAGE_SIZE,
  };
}

/** Legacy mode: the previous in-browser search, filter and sort of the loaded page. */
export function legacyRows(items: readonly ReviewSubmission[], controls: ReviewControls): ReviewSubmission[] {
  const q = controls.search.trim().toLowerCase();
  const filtered = items.filter((s) => {
    const name = `${s.student.firstName} ${s.student.lastName} ${s.student.username ?? ""}`.toLowerCase();
    if (q && !name.includes(q)) return false;
    if (controls.status === "open") return OPEN_STATUSES.includes(s.status);
    if (controls.status === "done") return DONE_STATUSES.includes(s.status);
    if (controls.status !== "all") return s.status === (controls.status as SubmissionStatus);
    return true;
  });
  return filtered.sort((x, y) => {
    if (controls.sort === "name") return `${x.student.firstName} ${x.student.lastName}`.localeCompare(`${y.student.firstName} ${y.student.lastName}`);
    if (controls.sort === "score") return (y.review?.score ?? -1) - (x.review?.score ?? -1);
    return new Date(y.submittedAt).getTime() - new Date(x.submittedAt).getTime();
  });
}

export interface ReviewCounts {
  open: number;
  done: number;
  all: number;
}

/** Legacy mode: totals of the loaded page only. */
export function legacyCounts(items: readonly Pick<ReviewSubmission, "status">[]): ReviewCounts {
  return {
    open: items.filter((s) => OPEN_STATUSES.includes(s.status)).length,
    done: items.filter((s) => DONE_STATUSES.includes(s.status)).length,
    all: items.length,
  };
}
