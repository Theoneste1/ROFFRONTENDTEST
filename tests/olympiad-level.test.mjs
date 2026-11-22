// Olympiad level (lib/accounts/olympiad-level.ts): history text, summary and the checks before a change.
import { test } from "node:test";
import assert from "node:assert/strict";

import { changeText, changedByText, levelChangeProblem, levelSummary, setLevelInput } from "../lib/accounts/olympiad-level.ts";

const J = { id: "j", code: "JUNIOR", name: "Junior" };
const M = { id: "m", code: "MIDDLE", name: "Middle" };

test("history text names the move and its source", () => {
  assert.equal(changeText({ source: "MANUAL", fromDivision: J, toDivision: M }), "Junior → Middle (set by hand)");
  assert.equal(changeText({ source: "AUTOMATIC", fromDivision: M, toDivision: J }), "Middle → Junior (follows the grade again)");
  assert.equal(changeText({ source: "GRADE", fromDivision: null, toDivision: J, gradeLevel: "S2" }), "Junior (grade S2)");
  assert.equal(changeText({ source: "SYSTEM", fromDivision: J, toDivision: J }), "Junior (system)");
});

test("who changed it", () => {
  assert.equal(changedByText({ changedBy: { id: "1", username: "amina", firstName: "Amina", lastName: "K" }, source: "MANUAL" }), "Amina K (@amina)");
  assert.equal(changedByText({ changedBy: null, source: "GRADE" }), "automatic, from the grade");
  assert.equal(changedByText({ changedBy: null, source: "SYSTEM" }), "system");
});

test("summary", () => {
  assert.equal(levelSummary({ level: M, manual: true, gradeLevel: "S2" }), "Middle — set by hand");
  assert.equal(levelSummary({ level: J, manual: false, gradeLevel: "S2" }), "Junior — follows grade S2");
  assert.equal(levelSummary({ level: null, manual: false, gradeLevel: null }), "Not set");
});

test("a change needs a choice, a reason, and must change something", () => {
  const auto = { level: J, manual: false, suggestedLevel: J };
  const hand = { level: M, manual: true, suggestedLevel: J };
  assert.match(levelChangeProblem(auto, "m", "no"), /reason/);
  assert.equal(levelChangeProblem(auto, "m", "Teacher submits as Middle"), undefined);
  assert.equal(levelChangeProblem(auto, "AUTOMATIC", "back to grade"), "The level already follows the grade.");
  assert.equal(levelChangeProblem(hand, "AUTOMATIC", "back to grade"), undefined);
  assert.equal(levelChangeProblem(hand, "m", "again please"), "This level is already set.");
  assert.equal(levelChangeProblem({ ...hand, suggestedLevel: null }, "AUTOMATIC", "back to grade"), "The student's grade suggests no level: choose one.");
  assert.equal(levelChangeProblem(auto, "", "a reason"), "Choose a level.");
  // The suggested level set by hand is a real change: it stops following the grade.
  assert.equal(levelChangeProblem(auto, "j", "pin to Junior"), undefined);
});

test("request body", () => {
  assert.deepEqual(setLevelInput("AUTOMATIC", " r1 "), { automatic: true, reason: "r1" });
  assert.deepEqual(setLevelInput("m", "why"), { divisionId: "m", reason: "why" });
});
