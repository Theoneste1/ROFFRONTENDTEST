/**
 * Test Management, Phase 4 (capability `testResults`): the pure rules of the publication, results, rankings, reports and
 * dashboard screens — when menus, tabs, pages and widgets show, the override's mandatory reason, labels, the
 * distribution bars. Unit-tested in tests/test-results.test.mjs. The backend remains the authority (who may publish, the
 * block, the override for Administrators only, G6, what students and teachers may see).
 */
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { ExportType, PreviewWarning, RankingBy, RankingDivision, RankingRow } from "../api/test-results";

export const TESTS_PUBLISH_RESULTS: Permission = "tests.publishResults";
export const TESTS_OVERRIDE_PUBLICATION: Permission = "tests.overridePublication";
export const TESTS_VIEW_RESULTS: Permission = "tests.viewResults";
export const TESTS_VIEW_RANKINGS: Permission = "tests.viewRankings";
export const TESTS_VIEW_OWN_RESULTS: Permission = "tests.viewOwnResults";
export const TESTS_VIEW_SCHOOL_RESULTS: Permission = "tests.viewSchoolResults";

/** The backend's limits for the override reason. */
export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 1000;

export function testResultsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "testResults");
}

/** A menu item (My results, Results, Test reports): the feature AND the known permission. */
export function resultsNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null, permission: Permission): boolean {
  return testResultsSupported(detection) && !!permissions && permissions.has(permission);
}

/** A test-page tab (Publishing, Results, Rankings) or a dashboard widget: the feature and the permission. */
export function resultsTabVisible(detection: BackendDetection | undefined, allowed: boolean): boolean {
  return testResultsSupported(detection) && allowed;
}

export type ResultsPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

export function resultsPageMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
  permission: Permission;
}): ResultsPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!testResultsSupported(opts.detection)) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(opts.permission) ? "visible" : "forbidden";
}

/** The override's reason: mandatory, 10 to 1,000 characters (the backend checks it again). null when acceptable. */
export function overrideReasonProblem(reason: string): string | null {
  const t = reason.trim();
  if (t.length === 0) return "Give the reason for publishing although some results are not approved.";
  if (t.length < OVERRIDE_REASON_MIN) return `At least ${OVERRIDE_REASON_MIN} characters.`;
  if (t.length > OVERRIDE_REASON_MAX) return `At most ${OVERRIDE_REASON_MAX} characters.`;
  return null;
}

export const WARNING_TEXT: Record<PreviewWarning, string> = {
  UNAPPROVED_RESULTS: "Some results are not approved yet. They are never published; they stay hidden.",
  ACTIVE_INDIVIDUAL_EXTENSIONS: "Individual extensions are still running: more answers may arrive after this publication.",
  ACTIVE_TEST_EXTENSION: "A whole-test extension is still running: more answers may arrive after this publication.",
  DEADLINE_NOT_PASSED: "The test's own deadline has not passed yet.",
};

/** What the publication panel offers: publish, a block message (Head Coach), or the override (Administrator). */
export function publishMode(actions: { publish: boolean; blocked: boolean; override: boolean }, approved: number):
  "publish" | "blocked" | "override" | "nothing" {
  if (actions.publish) return "publish";
  if (actions.override) return "override";
  if (actions.blocked) return "blocked";
  return approved > 0 ? "blocked" : "nothing";
}

export const RANKING_BY: ReadonlyArray<{ label: string; value: RankingBy }> = [
  { label: "Overall", value: "overall" },
  { label: "By division", value: "division" },
  { label: "By school", value: "school" },
];

/** Built-in names (the screens show the names of the divisions the backend lists: LevelName). */
export const DIVISION_TEXT: Record<RankingDivision, string> = { JUNIOR: "Junior", MIDDLE: "Middle", SENIOR: "Senior", UNKNOWN: "Unknown grade" };

/** The heading of a ranking row's group (null overall), so a table can show where a group starts. */
export function groupLabel(row: Pick<RankingRow, "group">): string | null {
  if (!row.group) return null;
  if ("division" in row.group) return DIVISION_TEXT[row.group.division] ?? row.group.division;
  return row.group.schoolName ?? "No school";
}

/** Rows that start a new group (by division / by school): the first row and every change of group. */
export function groupStarts(rows: ReadonlyArray<Pick<RankingRow, "group">>): boolean[] {
  return rows.map((r, i) => i === 0 || groupLabel(r) !== groupLabel(rows[i - 1]));
}

/** "=2" for a shared rank (a tie in competition ranking), "2" otherwise. */
export function rankText(rows: ReadonlyArray<Pick<RankingRow, "rank" | "group">>, i: number): string {
  const r = rows[i];
  const tied = rows.some((x, j) => j !== i && x.rank === r.rank && groupLabel(x) === groupLabel(r));
  return tied ? `=${r.rank}` : String(r.rank);
}

/** Bar widths (percent of the largest band) for the distribution chart. */
export function barWidths(counts: readonly number[]): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((c) => (max === 0 ? 0 : Math.round((c / max) * 100)));
}

/** "16.33" / "—". */
export function statText(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** "17 / 20" or "—". */
export function scoreText(marks: number | null | undefined, max: number): string {
  return marks === null || marks === undefined ? "—" : `${marks} / ${max}`;
}

export const EXPORTS: ReadonlyArray<{ type: ExportType; label: string }> = [
  { type: "results", label: "Results (one row per student)" },
  { type: "schools", label: "By school" },
  { type: "divisions", label: "By division" },
  { type: "questions", label: "By question" },
];

/** Where the test page of a staff portal is (Administrators /admin/tests; Head Coaches /mentor/tests). */
export const testPageOf = (portal: "admin" | "mentor", testId: string, tab?: string) =>
  `/${portal}/tests/${encodeURIComponent(testId)}${tab ? `?tab=${tab}` : ""}`;
