// Test Management, Phase 3 (lib/test-management/marking.ts; capability `testMarking`, owner-approved plan 2026-11-19):
// the coach's Marking menu and page gating, the staff tabs, the marks form (whole marks, never above a maximum), the
// mandatory reasons, the even-share preview. The backend remains the authority (permissions, transitions, G5, blindness).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  QUEUE_BADGE, REVIEW_FILTERS, STATUS_BADGE, TESTS_ADJUST_MARKS, TESTS_DISTRIBUTE, TESTS_MARK, TESTS_REVIEW, draftFrom, draftTotal,
  evenShareText, markingNavVisible, markingPageMode, markingTabVisible, marksBody, marksProblems, marksText, parseWhole, reasonProblem,
  testMarkingSupported,
} from "../lib/test-management/marking.ts";
import { MENTOR_MARKING, MENTOR_NAV } from "../lib/auth/navigation.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions", "testMarking"] };
const PHASE2 = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement", "testSubmissions"] };
const can = (...held) => (p) => held.includes(p);
const Q = [{ id: "q1", order: 1, maxMarks: 5 }, { id: "q2", order: 2, maxMarks: 15 }];

test("testMarking is a known feature; a backend without it shows nothing of Phase 3", () => {
  assert.ok(KNOWN_FEATURES.includes("testMarking"));
  assert.equal(testMarkingSupported(HAS), true);
  for (const d of [PHASE2, { state: "LEGACY" }, { state: "UNKNOWN", reason: "timeout" }, undefined, null]) assert.equal(testMarkingSupported(d), false);
  assert.equal(markingTabVisible(HAS, true), true);
  assert.equal(markingTabVisible(PHASE2, true), false);
  assert.equal(markingTabVisible(HAS, false), false);
});

test("the coach's Marking menu: tests.mark on a backend with the feature; never in the frozen coach menu", () => {
  assert.deepEqual([MENTOR_MARKING.href, MENTOR_MARKING.label, MENTOR_MARKING.permission], ["/mentor/marking", "Marking", TESTS_MARK]);
  assert.ok(!MENTOR_NAV.some((i) => i.href === "/mentor/marking"));
  assert.equal(markingNavVisible(HAS, new Set([TESTS_MARK])), true);
  assert.equal(markingNavVisible(HAS, new Set(["reviews.grade"])), false);   // a Head Coach or a coach without it
  assert.equal(markingNavVisible(PHASE2, new Set([TESTS_MARK])), false);
  assert.equal(markingNavVisible(HAS, null), false);
  assert.deepEqual([TESTS_DISTRIBUTE, TESTS_REVIEW, TESTS_ADJUST_MARKS], ["tests.distribute", "tests.review", "tests.adjustMarks"]);
});

test("the marking pages: loading, unsupported, error, forbidden, visible", () => {
  const base = { detection: HAS, detectionLoading: false, permissionsStatus: "ready", can: can(TESTS_MARK) };
  assert.equal(markingPageMode(base), "visible");
  assert.equal(markingPageMode({ ...base, detectionLoading: true }), "loading");
  assert.equal(markingPageMode({ ...base, permissionsStatus: "loading" }), "loading");
  assert.equal(markingPageMode({ ...base, detection: PHASE2 }), "unsupported");
  assert.equal(markingPageMode({ ...base, permissionsStatus: "error" }), "error");
  assert.equal(markingPageMode({ ...base, can: can(TESTS_REVIEW) }), "forbidden");
});

test("whole marks only: parseWhole", () => {
  assert.deepEqual(["", " ", "0", "7", " 12 "].map(parseWhole), [null, null, 0, 7, 12]);
  for (const bad of ["2.5", "-1", "x", "1e2", "3/4"]) assert.ok(Number.isNaN(parseWhole(bad)), bad);
});

test("the marks form: drafts may be partial; submitting needs every question; never above a maximum", () => {
  const d = draftFrom(Q, null);
  assert.deepEqual(d, { scores: { q1: { marks: "", comment: "" }, q2: { marks: "", comment: "" } }, total: "", comment: "" });
  assert.deepEqual(marksProblems(Q, 20, d, false), {});
  assert.deepEqual(marksProblems(Q, 20, d, true), { "q:q1": "Give the marks.", "q:q2": "Give the marks." });
  const bad = { ...d, scores: { q1: { marks: "6", comment: "" }, q2: { marks: "2.5", comment: "" } } };
  assert.deepEqual(marksProblems(Q, 20, bad, false), { "q:q1": "At most 5.", "q:q2": "Whole marks only (0 or more)." });
  const ok = { ...d, scores: { q1: { marks: "4", comment: " neat " }, q2: { marks: "", comment: "" } }, comment: " Good " };
  assert.equal(draftTotal(Q, ok), 4);
  assert.deepEqual(marksBody(Q, ok), { scores: [{ questionId: "q1", marks: 4, comment: "neat" }], comment: "Good" });
  // A comment without marks is kept (a draft); marks without a comment send comment null.
  assert.deepEqual(marksBody(Q, { ...ok, scores: { q1: { marks: "", comment: "look" }, q2: { marks: "9", comment: "" } } }).scores,
    [{ questionId: "q1", marks: null, comment: "look" }, { questionId: "q2", marks: 9, comment: null }]);
});

test("one total without questions; a saved marking fills the form", () => {
  const d = draftFrom([], { scores: [], totalMarks: 12, comment: "Clear" });
  assert.deepEqual([d.total, d.comment], ["12", "Clear"]);
  assert.deepEqual(marksProblems([], 20, { ...d, total: "21" }, false), { total: "At most 20." });
  assert.deepEqual(marksProblems([], 20, { ...d, total: "" }, true), { total: "Give the marks." });
  assert.deepEqual(marksBody([], d), { totalMarks: 12, comment: "Clear" });
  assert.equal(draftTotal([], d), 12);
  const filled = draftFrom(Q, { scores: [{ questionId: "q2", marks: 9, comment: "ok" }], totalMarks: 9, comment: null });
  assert.deepEqual(filled.scores.q2, { marks: "9", comment: "ok" });
  assert.equal(draftTotal(Q, filled), 9);
});

test("mandatory reasons and comments: 3–500 characters (a return's comment: up to 2000)", () => {
  assert.equal(reasonProblem("  "), "At least 3 characters.");
  assert.equal(reasonProblem("ok"), "At least 3 characters.");
  assert.equal(reasonProblem("Fair"), null);
  assert.equal(reasonProblem("x".repeat(501)), "At most 500 characters.");
  assert.equal(reasonProblem("x".repeat(1500), 2000), null);
});

test("the even-share preview and labels", () => {
  assert.equal(evenShareText(10, 0), "Choose at least one coach.");
  assert.equal(evenShareText(0, 3), "Nothing to distribute now.");
  assert.equal(evenShareText(5000, 20), "20 coaches: 250 each");
  assert.equal(evenShareText(11, 2), "2 coaches: 5 or 6 each");
  assert.equal(evenShareText(3, 1), "1 coach: 3 each");
  assert.equal(marksText(null, 20), "—");
  assert.equal(marksText(17, 20), "17 / 20");
  assert.deepEqual(Object.keys(QUEUE_BADGE), ["NOT_STARTED", "IN_PROGRESS", "MARKED"]);
  // Every status has a badge; the review filter offers every Phase 3 status (Published belongs to Phase 4).
  assert.equal(Object.keys(STATUS_BADGE).length, 8);
  assert.deepEqual(REVIEW_FILTERS.map((f) => f.value).filter(Boolean).sort(),
    ["APPROVED", "ASSIGNED", "AWAITING_SECOND_MARKING", "MARKED", "MARKING_IN_PROGRESS", "RETURNED", "SUBMITTED"]);
});
