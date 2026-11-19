// Test Management, Phase 1 (lib/test-management/rules.ts; capability `testManagement`, owner-approved plan 2026-11-19):
// the menu and page gating, the details form's rules (the backend's), the question sum rule and reordering.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_DETAILS, MAX_TEST_MARKS, TESTS_VIEW, detailsBody, detailsChange, detailsDraftOf, detailsProblems, fromLocalInput, moveItem,
  parseMarks, publishProblemText, questionProblems, questionSum, sumText, testManagementSupported, testsNavVisible, testsPageMode,
  toLocalInput,
} from "../lib/test-management/rules.ts";
import { ADMIN_NAV, ADMIN_TESTS, MENTOR_NAV, MENTOR_TESTS } from "../lib/auth/navigation.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["testManagement"] };
const WITHOUT = { state: "NEW", schemaVersion: 1, roles: [], features: ["countries"] };
const can = (...held) => (p) => held.includes(p);

test("testManagement is a known feature; LEGACY, UNKNOWN and a NEW backend without it never enable it", () => {
  assert.ok(KNOWN_FEATURES.includes("testManagement"));
  assert.equal(testManagementSupported(HAS), true);
  for (const d of [WITHOUT, { state: "LEGACY" }, { state: "UNKNOWN", reason: "timeout" }, undefined, null]) assert.equal(testManagementSupported(d), false);
});

test("menu: Administrators and Head Coaches with the feature AND the known tests.view; never in the frozen menus", () => {
  for (const item of [ADMIN_TESTS, MENTOR_TESTS]) assert.equal(item.permission, TESTS_VIEW);
  assert.equal(ADMIN_TESTS.href, "/admin/tests");
  assert.equal(MENTOR_TESTS.href, "/mentor/tests");
  assert.ok(!ADMIN_NAV.some((i) => i.href === "/admin/tests"));
  assert.ok(!MENTOR_NAV.some((i) => i.href === "/mentor/tests"));
  assert.equal(testsNavVisible(HAS, new Set(["tests.view"])), true);
  assert.equal(testsNavVisible(HAS, new Set(["reviews.grade"])), false);   // a coach: no test permission in Phase 1
  assert.equal(testsNavVisible(HAS, null), false);                         // not known yet: hidden
  assert.equal(testsNavVisible(WITHOUT, new Set(["tests.view"])), false);
});

test("page mode: loading, unsupported, error, forbidden, visible", () => {
  const base = { detection: HAS, detectionLoading: false, permissionsStatus: "ready", can: can("tests.view") };
  assert.equal(testsPageMode({ ...base, detectionLoading: true }), "loading");
  assert.equal(testsPageMode({ ...base, permissionsStatus: "loading" }), "loading");
  assert.equal(testsPageMode({ ...base, detection: WITHOUT }), "unsupported");
  assert.equal(testsPageMode({ ...base, permissionsStatus: "error" }), "error");
  assert.equal(testsPageMode({ ...base, can: can("reviews.grade") }), "forbidden");
  assert.equal(testsPageMode(base), "visible");
});

const VALID = { title: "Round 1", subjectId: "s1", division: "JUNIOR", answerFormat: "BOTH", opensAt: "2026-12-01T09:00", closesAt: "2026-12-01T11:00", maxMarks: "20" };

test("details: division mandatory (default All), opensAt before closesAt, whole positive marks, answer format chosen", () => {
  assert.equal(EMPTY_DETAILS.division, "ALL");
  assert.deepEqual(detailsProblems(VALID), {});
  assert.deepEqual(Object.keys(detailsProblems({ ...VALID, division: "" })), ["division"]);
  assert.deepEqual(Object.keys(detailsProblems({ ...VALID, answerFormat: "" })), ["answerFormat"]);
  assert.deepEqual(Object.keys(detailsProblems({ ...VALID, title: "ab" })), ["title"]);
  assert.match(detailsProblems({ ...VALID, closesAt: "2026-12-01T09:00" }).closesAt, /close after it opens/);
  assert.match(detailsProblems({ ...VALID, closesAt: "2026-12-01T08:00" }).closesAt, /close after it opens/);
  for (const bad of ["0", "-3", "12.5", "1e2", "", "abc", String(MAX_TEST_MARKS + 1)]) {
    assert.deepEqual([bad, Object.keys(detailsProblems({ ...VALID, maxMarks: bad }))], [bad, ["maxMarks"]]);
  }
  assert.equal(parseMarks(" 7 "), 7);
});

test("details: the API body carries ISO times; only changed fields are sent on edit", () => {
  const body = detailsBody(VALID);
  assert.equal(body.maxMarks, 20);
  assert.equal(body.opensAt, new Date("2026-12-01T09:00").toISOString());
  assert.equal(toLocalInput(body.opensAt), "2026-12-01T09:00");
  assert.equal(fromLocalInput(""), null);
  assert.equal(fromLocalInput("not a date"), null);
  const t = { ...body, id: "t1", subject: { id: "s1", code: "MATHEMATICS", name: "Mathematics" } };
  assert.deepEqual(detailsChange(t, detailsDraftOf(t)), {});
  assert.deepEqual(detailsChange(t, { ...detailsDraftOf(t), title: "Round 2", maxMarks: "25" }), { title: "Round 2", maxMarks: 25 });
  const moved = detailsChange(t, { ...detailsDraftOf(t), closesAt: "2026-12-02T11:00" });
  assert.deepEqual(Object.keys(moved), ["closesAt"]);
});

test("question sum rule: shown against the maximum; a question may never take the total above it", () => {
  assert.deepEqual(questionSum(20, []), { total: 0, remaining: 20, complete: true, over: false });
  assert.deepEqual(questionSum(20, [5, 15]), { total: 20, remaining: 0, complete: true, over: false });
  assert.deepEqual(questionSum(20, [5, 10]), { total: 15, remaining: 5, complete: false, over: false });
  assert.equal(questionSum(20, [15, 6]).over, true);
  assert.match(sumText(20, []), /one total out of 20/);
  assert.match(sumText(20, [5, 10]), /15 of 20 marks — 5 left/);
  assert.match(sumText(20, [15, 6]), /1 too many/);
  assert.deepEqual(questionProblems({ prompt: "Q", maxMarks: "5" }, 20, 15), {});
  assert.match(questionProblems({ prompt: "Q", maxMarks: "6" }, 20, 15).maxMarks, /At most 5 marks/);
  assert.ok(questionProblems({ prompt: "Q", maxMarks: "2.5" }, 20, 0).maxMarks);
  assert.ok(questionProblems({ prompt: "  ", maxMarks: "2" }, 20, 0).prompt);
});

test("reordering moves one question one place; the ends stay", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 1), ["a", "b", "c"]);
});

test("publish refusals are explained", () => {
  assert.match(publishProblemText("NO_PAPER_OR_QUESTIONS"), /paper or at least one question/);
  assert.match(publishProblemText("QUESTION_MARKS_MISMATCH"), /add up exactly/);
  assert.equal(publishProblemText("SOMETHING_NEW"), "SOMETHING_NEW");
});
