/**
 * The marking overviews (owner-approved designs 4 and 5, 2026-11-26): Head Coaches (/mentor/marking-overview, the
 * subjects they head) and Administrators (/admin/marking-overview, every subject). Every number comes from
 * GET /admin/test-dashboard (tests.view, capability testResults); these pure helpers add it up. Unit-tested in
 * tests/marking-overview.test.mjs.
 */
import type { BackendDetection } from "../api/capabilities";
import type { PublicationCounts, StaffDashboard } from "../api/test-results";
import type { SubmissionStatus } from "../api/test-submissions";
import { resultsNavVisible } from "./results";
import { TESTS_REVIEW } from "./marking";

/** A paper's way through marking, in order (the stacked bar and the status grid). */
export const STATUS_ORDER: readonly SubmissionStatus[] = [
  "SUBMITTED", "ASSIGNED", "MARKING_IN_PROGRESS", "MARKED", "RETURNED", "AWAITING_SECOND_MARKING", "APPROVED", "PUBLISHED",
];

/** Statuses counted as "marked" (a coach's marking is in): awaiting review, second marking, approved, published. */
export const MARKED_STATUSES: readonly SubmissionStatus[] = ["MARKED", "AWAITING_SECOND_MARKING", "APPROVED", "PUBLISHED"];

type Counts = Pick<PublicationCounts, "total" | "byStatus">;

export const countOf = (c: Counts, s: SubmissionStatus): number => c.byStatus[s] ?? 0;

/** Papers whose marking is in (MARKED + AWAITING_SECOND_MARKING + APPROVED + PUBLISHED). */
export function markedCount(c: Counts): number {
  return MARKED_STATUSES.reduce((a, s) => a + countOf(c, s), 0);
}

/** A whole percentage (0 when there is nothing to count). */
export function percent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export interface OverviewTotals {
  papers: number;
  byStatus: Record<SubmissionStatus, number>;
  pendingReview: number;
  returned: number;
  secondMarking: number;
  readyToPublish: number;
  /** Approved or published (locked marks). */
  approved: number;
  published: number;
  marked: number;
}

/** The sums over every subject in the dashboard. */
export function overviewTotals(subjects: StaffDashboard["subjects"]): OverviewTotals {
  const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<SubmissionStatus, number>;
  const t = { papers: 0, pendingReview: 0, returned: 0, secondMarking: 0, readyToPublish: 0, published: 0 };
  for (const s of subjects) {
    t.papers += s.submissions.total;
    t.pendingReview += s.pendingReview;
    t.returned += s.returned;
    t.secondMarking += s.awaitingSecondMarking;
    t.readyToPublish += s.readyToPublish;
    t.published += s.submissions.published;
    for (const st of STATUS_ORDER) byStatus[st] += s.submissions.byStatus[st] ?? 0;
  }
  return {
    ...t,
    byStatus,
    approved: byStatus.APPROVED + byStatus.PUBLISHED,
    marked: MARKED_STATUSES.reduce((a, st) => a + byStatus[st], 0),
  };
}

/** The test (of the dashboard's latest ten) with the most papers in a status; null when none has any. */
export function topTestBy<T extends { counts: Counts }>(tests: readonly T[], status: SubmissionStatus): T | null {
  let best: T | null = null;
  for (const t of tests) if (countOf(t.counts, status) > 0 && (!best || countOf(t.counts, status) > countOf(best.counts, status))) best = t;
  return best;
}

export type RecentTestState = "none" | "published" | "ready" | "marking";

/**
 * A recent test's state on the Administrator's overview: "published" when every paper is published; "ready" when
 * every paper is approved or published and some are not published yet; "none" without papers; otherwise "marking".
 */
export function recentTestState(c: Pick<PublicationCounts, "total" | "approved" | "published">): RecentTestState {
  if (c.total === 0) return "none";
  if (c.published === c.total) return "published";
  if (c.approved + c.published === c.total) return "ready";
  return "marking";
}

/** A coach's progress bar colour: amber under 30 %, green when everything assigned is marked, otherwise blue. */
export function coachProgressTone(marked: number, assigned: number): "amber" | "green" | "blue" {
  if (assigned > 0 && marked >= assigned) return "green";
  return percent(marked, assigned) < 30 ? "amber" : "blue";
}

/** Two initials for an avatar ("Eric Uwimana" → "EU"). */
export function initials(p: { firstName: string; lastName: string }): string {
  const s = `${p.firstName.trim().charAt(0)}${p.lastName.trim().charAt(0)}`.toUpperCase();
  return s || "?";
}

/** The coach rows whose name contains the search (case- and accent-insensitive); all of them for an empty search. */
export function filterCoaches<T extends { coach: { firstName: string; lastName: string } }>(rows: readonly T[], q: string): T[] {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = fold(q.trim());
  if (!needle) return [...rows];
  return rows.filter((r) => fold(`${r.coach.firstName} ${r.coach.lastName}`).includes(needle));
}

/** "Mathematics", "Mathematics and Physics", "Chemistry, Mathematics and Physics". */
export function listText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The stacked bar's segments (statuses with papers) and their widths in % of all papers. */
export function statusSegments(byStatus: Record<SubmissionStatus, number>): Array<{ status: SubmissionStatus; count: number; width: number }> {
  const total = STATUS_ORDER.reduce((a, s) => a + byStatus[s], 0);
  if (total === 0) return [];
  return STATUS_ORDER.filter((s) => byStatus[s] > 0).map((s) => ({ status: s, count: byStatus[s], width: (byStatus[s] / total) * 100 }));
}

/**
 * The menu item: the backend serves the dashboard (`testResults`) and the known tests.view; in the coach portal also the
 * known tests.review (Head Coaches — coaches who only mark do not see it).
 */
export function markingOverviewNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null, portal: "admin" | "mentor"): boolean {
  if (!resultsNavVisible(detection, permissions, "tests.view")) return false;
  return portal === "admin" || !!permissions?.has(TESTS_REVIEW);
}
