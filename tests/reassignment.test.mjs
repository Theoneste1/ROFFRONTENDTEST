// Reassign a submission (lib/test-management/reassignment.ts; owner 2026-11-28): the tests offered for a programme and
// a level, why a test cannot take the answer, the reason's checks, what changes, and the marking-started state.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REASSIGN_PROBLEM_LABEL, TESTS_REASSIGN_SUBMISSION, answerSummary, destinationsFor, divisionFits, keptParts, pickDestination,
  reassignChanges, reassignChoiceProblems, reassignReasonProblem, subjectsOf,
} from "../lib/test-management/reassignment.ts";

const MATHS = { id: "m", code: "MATHEMATICS", name: "Mathematics" };
const PHYS = { id: "p", code: "PHYSICS", name: "Physics" };
const COMP = { id: "c", code: "COMPUTING", name: "Computing" };
const dest = (id, subject, division, problem = null) => ({
  id, title: id, division, answerFormat: "BOTH", closesAt: "2026-12-01T10:00:00Z", subject,
  available: problem === null || problem === "SAME_TEST", problem,
});
const DESTS = [
  dest("mj", MATHS, "JUNIOR", "SAME_TEST"),
  dest("ms", MATHS, "SENIOR"),
  dest("mall", MATHS, "ALL"),
  dest("msp", MATHS, "SENIOR", "DUPLICATE_SUBMISSION"),
  dest("pall", PHYS, "ALL"),
  dest("call", COMP, "ALL", "FORMAT_MISMATCH"),
];
const options = (over = {}) => ({
  submission: { id: "s", publicCode: "RF-1", status: "SUBMITTED", level: "JUNIOR", firstSubmittedAt: null, lastSubmittedAt: null, student: { id: "u", username: "u", firstName: "A", lastName: "B" }, answer: { pages: 3, typed: true } },
  current: { test: { id: "mj", title: "mj", division: "JUNIOR" }, subject: MATHS, level: "JUNIOR" },
  markingStarted: false,
  marking: { status: "SUBMITTED", assignments: 0, markings: 0, questionTasks: 0, reviews: 0, withdrawals: 0, published: false },
  levels: [{ code: "JUNIOR", name: "Junior" }, { code: "SENIOR", name: "Senior" }],
  destinations: DESTS,
  ...over,
});
const ok = "The student is in S5.";

test("the permission is tests.reassignSubmission", () => {
  assert.equal(TESTS_REASSIGN_SUBMISSION, "tests.reassignSubmission");
});

test("a test fits a level when it is for every level or for exactly that level", () => {
  assert.equal(divisionFits("ALL", "SENIOR"), true);
  assert.equal(divisionFits("SENIOR", "SENIOR"), true);
  assert.equal(divisionFits("JUNIOR", "SENIOR"), false);
});

test("the tests offered: the chosen programme's, for every level or the chosen level (unavailable ones kept, to show why)", () => {
  assert.deepEqual(destinationsFor(DESTS, "m", "SENIOR").map((d) => d.id), ["ms", "mall", "msp"]);
  assert.deepEqual(destinationsFor(DESTS, "m", "JUNIOR").map((d) => d.id), ["mj", "mall"]);
  assert.deepEqual(destinationsFor(DESTS, "c", "JUNIOR").map((d) => d.id), ["call"]);
  assert.deepEqual(destinationsFor(DESTS, "x", "JUNIOR"), []);
});

test("every problem has a plain label", () => {
  for (const p of ["SAME_TEST", "DUPLICATE_SUBMISSION", "FORMAT_MISMATCH", "MARKING_STARTED", "TEST_NOT_PUBLISHED"]) assert.ok(REASSIGN_PROBLEM_LABEL[p]);
  assert.equal(REASSIGN_PROBLEM_LABEL.DUPLICATE_SUBMISSION, "already has an answer from this student");
});

test("subjects: the current one first, then the others by name, once each", () => {
  assert.deepEqual(subjectsOf(options()).map((s) => s.id), ["m", "c", "p"]);
});

test("after a change the chosen test stays if still offered and available; else the first available; else none", () => {
  const senior = destinationsFor(DESTS, "m", "SENIOR");
  assert.equal(pickDestination(senior, "mall"), "mall");
  assert.equal(pickDestination(senior, "mj"), "ms");
  assert.equal(pickDestination(senior, "msp"), "ms");
  assert.equal(pickDestination(destinationsFor(DESTS, "c", "JUNIOR"), "mj"), "");
  // The current test (SAME_TEST) is available: a level-only change.
  assert.equal(pickDestination(destinationsFor(DESTS, "m", "JUNIOR"), "mj"), "mj");
});

test("reason: required, 5–500 characters (spaces at the ends not counted), with a message that says what to do", () => {
  assert.match(reassignReasonProblem(""), /Write why/);
  assert.match(reassignReasonProblem("   abc  "), /at least 5/);
  assert.equal(reassignReasonProblem("  abcde "), undefined);
  assert.equal(reassignReasonProblem("x".repeat(500)), undefined);
  assert.match(reassignReasonProblem("x".repeat(501)), /500 characters or fewer/);
});

test("choice problems: nothing changes; an unavailable test; a test of another level; no test; ready", () => {
  const o = options();
  assert.match(reassignChoiceProblems(o, { subjectId: "m", level: "JUNIOR", testId: "mj", reason: ok }).test, /Nothing changes/);
  assert.match(reassignChoiceProblems(o, { subjectId: "m", level: "SENIOR", testId: "msp", reason: ok }).test, /already has an answer/);
  assert.match(reassignChoiceProblems(o, { subjectId: "m", level: "JUNIOR", testId: "ms", reason: ok }).test, /another level/);
  assert.match(reassignChoiceProblems(o, { subjectId: "c", level: "JUNIOR", testId: "", reason: ok }).test, /Choose the test/);
  assert.match(reassignChoiceProblems(o, { subjectId: "m", level: "SENIOR", testId: "ms", reason: "no" }).reason, /at least 5/);
  assert.deepEqual(reassignChoiceProblems(o, { subjectId: "m", level: "SENIOR", testId: "ms", reason: ok }), {});
  assert.deepEqual(reassignChoiceProblems(o, { subjectId: "p", level: "JUNIOR", testId: "pall", reason: ok }), {});
});

test("marking started: only the level can change within the same test; every other test is refused", () => {
  const started = DESTS.map((d) => (d.id === "mj" ? d : { ...d, available: false, problem: "MARKING_STARTED" }));
  const o = options({ markingStarted: true, destinations: [...started.filter((d) => d.id !== "mj"), { ...dest("mj", MATHS, "ALL", "SAME_TEST") }], current: { test: { id: "mj", title: "mj", division: "ALL" }, subject: MATHS, level: "JUNIOR" } });
  assert.match(reassignChoiceProblems(o, { subjectId: "m", level: "SENIOR", testId: "ms", reason: ok }).test, /marking has started/);
  assert.deepEqual(reassignChoiceProblems(o, { subjectId: "m", level: "SENIOR", testId: "mj", reason: ok }), {});
  assert.equal(pickDestination(destinationsFor(o.destinations, "m", "SENIOR"), "mj"), "mj");
});

test("changes: test, subject and level flags for the review step", () => {
  const o = options();
  assert.deepEqual(reassignChanges(o, { testId: "ms", level: "SENIOR" }), { test: true, subject: false, level: true });
  assert.deepEqual(reassignChanges(o, { testId: "pall", level: "JUNIOR" }), { test: true, subject: true, level: false });
});

test("answer summary and what is kept", () => {
  assert.equal(answerSummary({ pages: 3, typed: true }), "3 pages + typed answer");
  assert.equal(answerSummary({ pages: 1, typed: false }), "1 page");
  assert.equal(answerSummary({ pages: 0, typed: true }), "typed answer");
  assert.deepEqual(keptParts({ pages: 1, typed: true }), ["1 uploaded page", "the typed answer"]);
});
