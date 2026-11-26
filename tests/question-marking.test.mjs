// Question-level marking (design Rev 5.2, owner approval 2026-11-26): the frontend's pure rules
// (lib/test-management/question-marking.ts). The backend decides every rule; these only show and send.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COACH_STATE_BADGE, COACH_VIEWS, DEFAULT_COACH_VIEW, LOST_MESSAGE, PAPER_PROGRESS_LABEL, TASK_STATUS_BADGE, coachAction, coachQueueVisible,
  coachRefusal, coachViewKey, heartbeatMs, lostMessage, minutesLeft, parseQuestionMarks, parseRef, readCoachView, reasonProblem, refLabel,
  saveCoachView, staffRefusal, staffTabVisible, submitProblem, workspacePath,
} from "../lib/test-management/question-marking.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("the feature is known; screens show only with it and the permission", () => {
  assert.ok(KNOWN_FEATURES.includes("questionMarking"));
  assert.equal(coachQueueVisible(NEW(["questionMarking"]), true), true);
  assert.equal(coachQueueVisible(NEW(["questionMarking"]), false), false);
  assert.equal(coachQueueVisible(NEW(["testMarking"]), true), false);
  assert.equal(coachQueueVisible({ state: "LEGACY" }, true), false);
  assert.equal(staffTabVisible(NEW(["questionMarking"]), true), true);
  assert.equal(staffTabVisible(undefined, true), false);
});

test("references: q2 is question 2; q2-s1 its second assessment; anything else is refused", () => {
  assert.deepEqual(parseRef("q2"), { order: 2, second: 0 });
  assert.deepEqual(parseRef("q12-s1"), { order: 12, second: 1 });
  for (const bad of ["", "q0", "Q2", "q2-s0", "q-1", "2", "q2-x1", "q2-s1-s2", "q1000"]) assert.equal(parseRef(bad), null, bad);
  assert.equal(refLabel("q2"), "Question 2");
  assert.equal(refLabel("q2-s1"), "Question 2 · second assessment");
  assert.equal(refLabel("q2-s2"), "Question 2 · second assessment 2");
  assert.equal(workspacePath("ABCD-1234", "q2-s1"), "/mentor/marking/q/ABCD-1234/q2-s1");
});

test("marks of one question: empty is not marked; whole numbers 0..max; anything else explained", () => {
  assert.deepEqual(parseQuestionMarks("", 5), { ok: true, marks: null });
  assert.deepEqual(parseQuestionMarks(" 0 ", 5), { ok: true, marks: 0 });
  assert.deepEqual(parseQuestionMarks("5", 5), { ok: true, marks: 5 });
  assert.match(parseQuestionMarks("6", 5).error, /out of 5\. Enter 5 or less/);
  for (const bad of ["-1", "2.5", "abc", "1e2", "+3"]) assert.match(parseQuestionMarks(bad, 5).error, /whole number from 0 to 5/, bad);
  assert.equal(submitProblem(null, ""), "Enter the marks for this question before submitting.");
  assert.equal(submitProblem(0, ""), null);
  assert.match(submitProblem(3, "x".repeat(2001)), /2000 characters/);
  assert.match(reasonProblem("  a "), /at least 3/);
  assert.equal(reasonProblem("Wrong page read"), null);
  assert.match(reasonProblem("x".repeat(501)), /500 characters/);
});

test("the coach's Show choice is saved per account; unknown or unavailable storage gives To mark", () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(readCoachView(storage, "u1"), DEFAULT_COACH_VIEW);
  saveCoachView(storage, "u1", "SUBMITTED");
  assert.equal(readCoachView(storage, "u1"), "SUBMITTED");
  assert.equal(readCoachView(storage, "u2"), "TO_MARK");
  store.set(coachViewKey("u1"), "EVERYTHING");
  assert.equal(readCoachView(storage, "u1"), "TO_MARK");
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
  assert.equal(readCoachView(broken, "u1"), "TO_MARK");
  assert.doesNotThrow(() => saveCoachView(broken, "u1", "ALL"));
  assert.deepEqual(COACH_VIEWS.map((v) => v.value), ["TO_MARK", "MINE", "RETURNED", "SUBMITTED", "ALL"]);
});

test("queue rows: mine and returned continue, available is taken, taken shows no name and no action", () => {
  assert.equal(coachAction("MINE"), "continue");
  assert.equal(coachAction("RETURNED_TO_ME"), "continue");
  assert.equal(coachAction("AVAILABLE"), "take");
  assert.equal(coachAction("SUBMITTED_BY_ME"), "view");
  assert.equal(coachAction("TAKEN"), null);
  assert.equal(COACH_STATE_BADGE.TAKEN.label, "Taken by another coach");
  for (const s of ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "UNDER_REVIEW", "RETURNED", "AWAITING_SECOND", "APPROVED", "CLOSED", "CANCELLED"]) {
    assert.ok(TASK_STATUS_BADGE[s].label, s);
  }
  for (const k of ["NOT_STARTED", "PARTIALLY_MARKED", "ALL_SUBMITTED", "PARTIALLY_APPROVED", "RETURNED_WORK", "FULLY_APPROVED"]) assert.ok(PAPER_PROGRESS_LABEL[k], k);
});

test("the hold: heartbeat from the server (120 s default, never below 30 s); minutes left", () => {
  assert.equal(heartbeatMs(120), 120_000);
  assert.equal(heartbeatMs(undefined), 120_000);
  assert.equal(heartbeatMs(0), 120_000);
  assert.equal(heartbeatMs(5), 30_000);
  const now = Date.parse("2026-12-01T10:00:00Z");
  assert.equal(minutesLeft("2026-12-01T10:29:59Z", now), 29);
  assert.equal(minutesLeft("2026-12-01T09:59:00Z", now), 0);
  assert.equal(minutesLeft(null, now), null);
});

test("a lost hold says why and what to do, for every reason; refusals are plain words", () => {
  for (const r of ["EXPIRED", "RELEASED", "RELEASED_BY_STAFF", "REASSIGNED", "AUTHORISATION_LOST", "CANCELLED", "SUBMITTED"]) {
    assert.ok(LOST_MESSAGE[r].length > 30, r);
    assert.equal(lostMessage(r), LOST_MESSAGE[r]);
  }
  assert.equal(lostMessage(undefined), LOST_MESSAGE.EXPIRED);
  assert.equal(lostMessage("SOMETHING_NEW"), LOST_MESSAGE.EXPIRED);
  assert.match(LOST_MESSAGE.EXPIRED, /more than 30 minutes/);
  assert.match(coachRefusal("TASK_TAKEN"), /Another coach took this question a moment ago/);
  assert.match(coachRefusal("CLAIM_LIMIT"), /already marking 3 questions/);
  assert.match(coachRefusal("FIRST_MARKER_EXCLUDED"), /another coach must do the second assessment/);
  assert.equal(coachRefusal("SOMETHING_ELSE"), null);
  assert.match(staffRefusal("TASK_CHANGED"), /changed this question a moment ago/);
  assert.match(staffRefusal("MARKING_STARTED"), /can no longer change/);
  assert.match(staffRefusal("CLAIM_LIMIT"), /That coach is already marking 3/);
  assert.match(staffRefusal("TASK_TAKEN"), /Another coach took/);
});
