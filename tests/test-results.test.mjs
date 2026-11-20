// Test Management, Phase 4 (lib/test-management/results.ts; capability `testResults`, owner-approved plan 2026-11-19):
// menus, tabs, pages and widgets gating, the override's mandatory reason, what the publication panel offers, the ranking
// table helpers (competition ranks, groups) and the report helpers. The backend remains the authority.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DIVISION_TEXT, EXPORTS, OVERRIDE_REASON_MIN, RANKING_BY, TESTS_OVERRIDE_PUBLICATION, TESTS_PUBLISH_RESULTS, TESTS_VIEW_OWN_RESULTS,
  TESTS_VIEW_RANKINGS, TESTS_VIEW_RESULTS, TESTS_VIEW_SCHOOL_RESULTS, WARNING_TEXT, barWidths, groupLabel, groupStarts, overrideReasonProblem,
  publishMode, rankText, resultsNavVisible, resultsPageMode, resultsTabVisible, scoreText, statText, testPageOf, testResultsSupported,
} from "../lib/test-management/results.ts";
import {
  ADMIN_NAV, ADMIN_TEST_REPORTS, MENTOR_NAV, MENTOR_TEST_REPORTS, STUDENT_RESULTS, TEACHER_NAV, TEACHER_RESULTS,
} from "../lib/auth/navigation.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { REVIEW_FILTERS } from "../lib/test-management/marking.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions", "testMarking", "testResults"] };
const PHASE3 = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions", "testMarking"] };
const can = (...held) => (p) => held.includes(p);

test("testResults is a known feature; a backend without it shows nothing of Phase 4", () => {
  assert.ok(KNOWN_FEATURES.includes("testResults"));
  assert.equal(testResultsSupported(HAS), true);
  for (const d of [PHASE3, { state: "LEGACY" }, { state: "UNKNOWN", reason: "timeout" }, undefined, null]) assert.equal(testResultsSupported(d), false);
  assert.equal(resultsTabVisible(HAS, true), true);
  assert.equal(resultsTabVisible(PHASE3, true), false);
  assert.equal(resultsTabVisible(HAS, false), false);
  assert.deepEqual(
    [TESTS_PUBLISH_RESULTS, TESTS_OVERRIDE_PUBLICATION, TESTS_VIEW_RESULTS, TESTS_VIEW_RANKINGS, TESTS_VIEW_OWN_RESULTS, TESTS_VIEW_SCHOOL_RESULTS],
    ["tests.publishResults", "tests.overridePublication", "tests.viewResults", "tests.viewRankings", "tests.viewOwnResults", "tests.viewSchoolResults"]);
});

test("menus: My results (students), Results (teachers); Test reports (Administrators, Head Coaches: linked from Tests and the dashboard) — never in the frozen menus", () => {
  assert.deepEqual([STUDENT_RESULTS.href, STUDENT_RESULTS.permission], ["/student/results", TESTS_VIEW_OWN_RESULTS]);
  assert.deepEqual([TEACHER_RESULTS.href, TEACHER_RESULTS.permission], ["/teacher/results", TESTS_VIEW_SCHOOL_RESULTS]);
  assert.deepEqual([ADMIN_TEST_REPORTS.href, ADMIN_TEST_REPORTS.permission], ["/admin/test-reports", TESTS_VIEW_RESULTS]);
  assert.deepEqual([MENTOR_TEST_REPORTS.href, MENTOR_TEST_REPORTS.permission], ["/mentor/test-reports", TESTS_VIEW_RESULTS]);
  for (const nav of [ADMIN_NAV, MENTOR_NAV, TEACHER_NAV]) assert.ok(!nav.some((i) => /results|test-reports/.test(i.href) && i.href !== "/admin/results"));
  assert.equal(resultsNavVisible(HAS, new Set([TESTS_VIEW_OWN_RESULTS]), TESTS_VIEW_OWN_RESULTS), true);
  assert.equal(resultsNavVisible(HAS, new Set(["tests.submit"]), TESTS_VIEW_OWN_RESULTS), false);
  assert.equal(resultsNavVisible(PHASE3, new Set([TESTS_VIEW_OWN_RESULTS]), TESTS_VIEW_OWN_RESULTS), false);
  assert.equal(resultsNavVisible(HAS, null, TESTS_VIEW_RESULTS), false);   // unknown permissions: hidden (a new menu)
});

test("results pages: loading, unsupported, error, forbidden, visible", () => {
  const base = { detection: HAS, detectionLoading: false, permissionsStatus: "ready", can: can(TESTS_VIEW_OWN_RESULTS), permission: TESTS_VIEW_OWN_RESULTS };
  assert.equal(resultsPageMode(base), "visible");
  assert.equal(resultsPageMode({ ...base, detectionLoading: true }), "loading");
  assert.equal(resultsPageMode({ ...base, permissionsStatus: "loading" }), "loading");
  assert.equal(resultsPageMode({ ...base, detection: PHASE3 }), "unsupported");
  assert.equal(resultsPageMode({ ...base, permissionsStatus: "error" }), "error");
  assert.equal(resultsPageMode({ ...base, can: can("tests.submit") }), "forbidden");
  // A teacher's page needs the teacher's permission.
  assert.equal(resultsPageMode({ ...base, permission: TESTS_VIEW_SCHOOL_RESULTS }), "forbidden");
});

test("the override reason is mandatory: at least 10 characters (trimmed), at most 1,000", () => {
  assert.equal(OVERRIDE_REASON_MIN, 10);
  assert.match(overrideReasonProblem(""), /Give the reason/);
  assert.match(overrideReasonProblem("   "), /Give the reason/);
  assert.match(overrideReasonProblem("too short"), /At least 10/);
  assert.match(overrideReasonProblem("  too short  "), /At least 10/);
  assert.equal(overrideReasonProblem("Prize ceremony on Friday"), null);
  assert.match(overrideReasonProblem("x".repeat(1001)), /At most 1000/);
});

test("the publication panel offers publish, a block (Head Coach) or the override (Administrator) — as the server says", () => {
  assert.equal(publishMode({ publish: true, blocked: false, override: false }, 3), "publish");
  assert.equal(publishMode({ publish: false, blocked: true, override: false }, 3), "blocked");
  assert.equal(publishMode({ publish: false, blocked: false, override: true }, 3), "override");
  // Nothing approved and nothing blocking: nothing to do.
  assert.equal(publishMode({ publish: false, blocked: false, override: false }, 0), "nothing");
  // An unexpected answer with approved results never offers a button.
  assert.equal(publishMode({ publish: false, blocked: false, override: false }, 2), "blocked");
  for (const w of ["UNAPPROVED_RESULTS", "ACTIVE_INDIVIDUAL_EXTENSIONS", "ACTIVE_TEST_EXTENSION", "DEADLINE_NOT_PASSED"]) assert.ok(WARNING_TEXT[w]);
});

test("rankings: competition ranks shown as =n for ties within the same group; group headings", () => {
  const overall = [{ rank: 1, group: null }, { rank: 1, group: null }, { rank: 3, group: null }];
  assert.deepEqual(overall.map((_, i) => rankText(overall, i)), ["=1", "=1", "3"]);
  const byDivision = [
    { rank: 1, group: { division: "JUNIOR" } }, { rank: 2, group: { division: "JUNIOR" } }, { rank: 1, group: { division: "SENIOR" } },
  ];
  assert.deepEqual(byDivision.map((_, i) => rankText(byDivision, i)), ["1", "2", "1"]);
  assert.deepEqual(groupStarts(byDivision), [true, false, true]);
  assert.equal(groupLabel(byDivision[0]), DIVISION_TEXT.JUNIOR);
  assert.equal(groupLabel({ group: { schoolId: null, schoolName: null } }), "No school");
  assert.equal(groupLabel({ group: null }), null);
  assert.deepEqual(RANKING_BY.map((x) => x.value), ["overall", "division", "school"]);
});

test("report helpers: bars relative to the largest band; numbers; exports; test page links", () => {
  assert.deepEqual(barWidths([0, 2, 1, 4]), [0, 50, 25, 100]);
  assert.deepEqual(barWidths([0, 0]), [0, 0]);
  assert.deepEqual([statText(null), statText(17), statText(16.333)], ["—", "17", "16.33"]);
  assert.deepEqual([scoreText(null, 20), scoreText(17, 20)], ["—", "17 / 20"]);
  assert.deepEqual(EXPORTS.map((x) => x.type), ["results", "schools", "divisions", "questions"]);
  assert.equal(testPageOf("admin", "t1", "results"), "/admin/tests/t1?tab=results");
  assert.equal(testPageOf("mentor", "t1"), "/mentor/tests/t1");
});

test("review: published results can be filtered (and unlocked: G6 withdrawal)", () => {
  assert.ok(REVIEW_FILTERS.some((f) => f.value === "PUBLISHED"));
});
