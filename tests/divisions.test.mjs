// Divisions = Olympiad levels (lib/divisions/divisions.ts): labels, grades, choices, coverage and codes.
import { test } from "node:test";
import assert from "node:assert/strict";

import { activeDivisions, coverageProblems, divisionCodeProblem, divisionLabel, divisionOptionLabel, gradesText, suggestedGrades, testLevelOptions } from "../lib/divisions/divisions.ts";

const D = [
  { id: "s", code: "SENIOR", name: "Senior", isActive: true, suggestedGrades: ["S4", "S5", "S6"], sortOrder: 3 },
  { id: "m", code: "MIDDLE", name: "Middle", isActive: true, suggestedGrades: [], sortOrder: 2 },
  { id: "j", code: "JUNIOR", name: "Junior", isActive: true, suggestedGrades: ["S1", "S2", "S3"], sortOrder: 1 },
  { id: "x", code: "OLD_LEVEL", name: "Old", isActive: false, suggestedGrades: [], sortOrder: 4 },
];

test("labels come from the loaded divisions, then built-in names, then the code", () => {
  assert.equal(divisionLabel("MIDDLE", D), "Middle");
  assert.equal(divisionLabel("MIDDLE", undefined), "Middle");
  assert.equal(divisionLabel("ALL", D), "All");
  assert.equal(divisionLabel("ADVANCED_2", D), "Advanced 2");
  assert.equal(divisionLabel(null, D), "—");
});

test("grades text", () => {
  assert.equal(gradesText(["S3", "S1", "S2"]), "S1–S3");
  assert.equal(gradesText(["S1", "S4"]), "S1, S4");
  assert.equal(gradesText(["S2"]), "S2");
  assert.equal(gradesText([]), "");
  assert.deepEqual(suggestedGrades({ gradeLevels: ["S1"] }), ["S1"]);
});

test("choices: active divisions in order, ALL first for tests; Middle has no grade", () => {
  assert.deepEqual(activeDivisions(D).map((d) => d.code), ["JUNIOR", "MIDDLE", "SENIOR"]);
  assert.equal(divisionOptionLabel(D[1]), "Middle");
  assert.equal(divisionOptionLabel(D[2]), "Junior (S1–S3)");
  assert.deepEqual(testLevelOptions(D).map((o) => o.value), ["ALL", "JUNIOR", "MIDDLE", "SENIOR"]);
  assert.deepEqual(testLevelOptions(undefined).map((o) => o.value), ["ALL"]);
});

test("every grade belongs to exactly one active division", () => {
  const g = D.map((d) => ({ code: d.code, isActive: d.isActive, grades: d.suggestedGrades }));
  assert.deepEqual(coverageProblems(g), []);
  assert.deepEqual(coverageProblems(g.map((d) => (d.code === "SENIOR" ? { ...d, isActive: false } : d))), ["S4 is suggested by no active division", "S5 is suggested by no active division", "S6 is suggested by no active division"]);
  assert.deepEqual(coverageProblems([...g, { code: "NEW", isActive: true, grades: ["S1"] }]), ["S1 is suggested by more than one active division (JUNIOR, NEW)"]);
});

test("a new division's code", () => {
  assert.equal(divisionCodeProblem("ADVANCED"), undefined);
  assert.equal(divisionCodeProblem("advanced_2"), undefined);
  assert.equal(divisionCodeProblem("ALL"), "ALL is reserved.");
  assert.match(divisionCodeProblem("2X"), /letters/);
  assert.match(divisionCodeProblem("A"), /letters/);
  assert.match(divisionCodeProblem("WITH SPACE"), /letters/);
});
