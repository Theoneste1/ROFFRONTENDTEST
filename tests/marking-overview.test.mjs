// The marking overviews (lib/test-management/marking-overview.ts; owner-approved designs 4 and 5, 2026-11-26): the sums
// over GET /admin/test-dashboard, the recent tests' state, the coaches' progress colour and search, the menu gating.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MARKED_STATUSES, STATUS_ORDER, coachProgressTone, filterCoaches, initials, listText, markedCount, markingOverviewNavVisible, overviewTotals,
  percent, recentTestState, statusSegments, topTestBy,
} from "../lib/test-management/marking-overview.ts";
import { ADMIN_MARKING_OVERVIEW, ADMIN_NAV, MENTOR_MARKING_OVERVIEW, MENTOR_NAV } from "../lib/auth/navigation.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions", "testMarking", "testResults"] };
const PHASE3 = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions", "testMarking"] };

const subject = (code, byStatus, extra = {}) => {
  const total = Object.values(byStatus).reduce((a, n) => a + n, 0);
  const approved = byStatus.APPROVED ?? 0;
  const published = byStatus.PUBLISHED ?? 0;
  return {
    subject: { id: code, code, name: code[0] + code.slice(1).toLowerCase() },
    tests: { draft: 1, published: 2 },
    submissions: { total, byStatus, approved, published, unapproved: total - approved - published },
    pendingReview: byStatus.MARKED ?? 0, returned: byStatus.RETURNED ?? 0, awaitingSecondMarking: byStatus.AWAITING_SECOND_MARKING ?? 0,
    readyToPublish: approved, activeExtensions: 0, authorisedMarkers: 3, headCoaches: 1, ...extra,
  };
};

test("eight statuses in the order a paper moves; four count as marked", () => {
  assert.equal(STATUS_ORDER.length, 8);
  assert.equal(new Set(STATUS_ORDER).size, 8);
  assert.deepEqual([...MARKED_STATUSES], ["MARKED", "AWAITING_SECOND_MARKING", "APPROVED", "PUBLISHED"]);
  assert.equal(markedCount({ total: 10, byStatus: { SUBMITTED: 2, MARKED: 3, APPROVED: 4, PUBLISHED: 1 } }), 8);
  assert.equal(markedCount({ total: 0, byStatus: {} }), 0);
});

test("percent: whole numbers, 0 without a total", () => {
  assert.equal(percent(281, 412), 68);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(5, 0), 0);
});

test("overviewTotals adds up every subject (missing statuses count 0)", () => {
  const t = overviewTotals([
    subject("MATHEMATICS", { SUBMITTED: 15, ASSIGNED: 22, MARKING_IN_PROGRESS: 38, MARKED: 12, RETURNED: 2, APPROVED: 30, PUBLISHED: 40 }),
    subject("PHYSICS", { AWAITING_SECOND_MARKING: 1, APPROVED: 26 }),
  ]);
  assert.equal(t.papers, 186);
  assert.deepEqual(t.byStatus, { SUBMITTED: 15, ASSIGNED: 22, MARKING_IN_PROGRESS: 38, MARKED: 12, RETURNED: 2, AWAITING_SECOND_MARKING: 1, APPROVED: 56, PUBLISHED: 40 });
  assert.equal(t.pendingReview, 12);
  assert.equal(t.returned, 2);
  assert.equal(t.secondMarking, 1);
  assert.equal(t.readyToPublish, 56);
  assert.equal(t.approved, 96, "approved or published");
  assert.equal(t.published, 40);
  assert.equal(t.marked, 12 + 1 + 56 + 40);
  const empty = overviewTotals([]);
  assert.equal(empty.papers, 0);
  assert.equal(empty.marked, 0);
  assert.equal(empty.byStatus.PUBLISHED, 0);
});

test("topTestBy: the test with the most papers in a status, null when none", () => {
  const tests = [
    { id: "a", counts: { total: 5, byStatus: { MARKED: 2 } } },
    { id: "b", counts: { total: 9, byStatus: { MARKED: 7, SUBMITTED: 1 } } },
    { id: "c", counts: { total: 3, byStatus: {} } },
  ];
  assert.equal(topTestBy(tests, "MARKED")?.id, "b");
  assert.equal(topTestBy(tests, "SUBMITTED")?.id, "b");
  assert.equal(topTestBy(tests, "RETURNED"), null);
  assert.equal(topTestBy([], "MARKED"), null);
});

test("recentTestState: published, ready to publish, in marking, no papers", () => {
  assert.equal(recentTestState({ total: 0, approved: 0, published: 0 }), "none");
  assert.equal(recentTestState({ total: 52, approved: 0, published: 52 }), "published");
  assert.equal(recentTestState({ total: 52, approved: 52, published: 0 }), "ready");
  assert.equal(recentTestState({ total: 52, approved: 10, published: 42 }), "ready", "a few approved after a publication");
  assert.equal(recentTestState({ total: 63, approved: 48, published: 0 }), "marking");
});

test("coach progress colour: amber under 30 %, green when all marked, else blue", () => {
  assert.equal(coachProgressTone(7, 24), "amber");
  assert.equal(coachProgressTone(0, 0), "amber");
  assert.equal(coachProgressTone(18, 22), "blue");
  assert.equal(coachProgressTone(12, 12), "green");
  assert.equal(coachProgressTone(9, 30), "blue", "30 % is not under 30 %");
});

test("initials and the coach search (case- and accent-insensitive)", () => {
  assert.equal(initials({ firstName: "Eric", lastName: "Uwimana" }), "EU");
  assert.equal(initials({ firstName: " ", lastName: "" }), "?");
  const rows = [{ coach: { firstName: "Éric", lastName: "Uwimana" } }, { coach: { firstName: "Sarah", lastName: "Niyonsaba" } }];
  assert.equal(filterCoaches(rows, "").length, 2);
  assert.deepEqual(filterCoaches(rows, "eric").map((r) => r.coach.lastName), ["Uwimana"]);
  assert.deepEqual(filterCoaches(rows, "SARAH NIY").map((r) => r.coach.lastName), ["Niyonsaba"]);
  assert.deepEqual(filterCoaches(rows, "zz"), []);
});

test("listText names the subjects in plain words", () => {
  assert.equal(listText([]), "");
  assert.equal(listText(["Mathematics"]), "Mathematics");
  assert.equal(listText(["Mathematics", "Physics"]), "Mathematics and Physics");
  assert.equal(listText(["Chemistry", "Mathematics", "Physics"]), "Chemistry, Mathematics and Physics");
});

test("statusSegments: only statuses with papers, widths adding up to 100 %", () => {
  const by = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  assert.deepEqual(statusSegments(by), []);
  const segs = statusSegments({ ...by, SUBMITTED: 1, APPROVED: 3 });
  assert.deepEqual(segs.map((s) => [s.status, s.count, s.width]), [["SUBMITTED", 1, 25], ["APPROVED", 3, 75]]);
});

test("menu: testResults + tests.view; the coach portal also needs tests.review (Head Coaches); not in the frozen menus", () => {
  assert.deepEqual([ADMIN_MARKING_OVERVIEW.href, ADMIN_MARKING_OVERVIEW.label, ADMIN_MARKING_OVERVIEW.permission], ["/admin/marking-overview", "Marking overview", "tests.view"]);
  assert.deepEqual([MENTOR_MARKING_OVERVIEW.href, MENTOR_MARKING_OVERVIEW.label, MENTOR_MARKING_OVERVIEW.permission], ["/mentor/marking-overview", "Marking overview", "tests.view"]);
  assert.ok(!ADMIN_NAV.some((i) => i.href === ADMIN_MARKING_OVERVIEW.href));
  assert.ok(!MENTOR_NAV.some((i) => i.href === MENTOR_MARKING_OVERVIEW.href));
  const head = new Set(["tests.view", "tests.review", "tests.distribute"]);
  const viewOnly = new Set(["tests.view"]);
  const coach = new Set(["tests.mark"]);
  assert.equal(markingOverviewNavVisible(HAS, viewOnly, "admin"), true);
  assert.equal(markingOverviewNavVisible(HAS, head, "mentor"), true);
  assert.equal(markingOverviewNavVisible(HAS, viewOnly, "mentor"), false, "no tests.review: not a Head Coach");
  assert.equal(markingOverviewNavVisible(HAS, coach, "mentor"), false);
  assert.equal(markingOverviewNavVisible(HAS, coach, "admin"), false);
  assert.equal(markingOverviewNavVisible(PHASE3, head, "mentor"), false, "the dashboard needs testResults");
  assert.equal(markingOverviewNavVisible(undefined, head, "admin"), false);
  assert.equal(markingOverviewNavVisible(HAS, null, "admin"), false, "unknown permissions: hidden");
});
