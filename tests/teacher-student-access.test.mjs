// Teacher–student access (TS-1…TS-6) — lib/accounts/teacher-student-access.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abilities, accessBadges, assignReasonProblem, itemText, outcomeSummary, pendingText, problemLines, scopeText, teacherStudentAccessSupported,
} from "../lib/accounts/teacher-student-access.ts";

test("offered only by backends with teacherStudentAccess", () => {
  assert.equal(teacherStudentAccessSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["teacherStudentAccess"] }), true);
  assert.equal(teacherStudentAccessSupported({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), false);
  assert.equal(teacherStudentAccessSupported({ state: "LEGACY" }), false);
  assert.equal(teacherStudentAccessSupported(undefined), false);
});

test("scope text: an older delegation without a scope is school-wide; selected shows its count", () => {
  assert.equal(scopeText(null), "All students of the teacher's schools");
  assert.equal(scopeText("ASSIGNED"), "Only students assigned to the teacher");
  assert.equal(scopeText("SELECTED", 3), "Only selected students (3)");
  assert.equal(scopeText("SELECTED"), "Only selected students");
});

test("results: summary in a fixed order, plain reasons, failed lines with names", () => {
  const results = [
    { studentId: "a", outcome: "ASSIGNED" },
    { studentId: "b", outcome: "SKIPPED", code: "ALREADY_ASSIGNED" },
    { studentId: "c", outcome: "FAILED", code: "REASON_REQUIRED" },
    { studentId: "d", outcome: "ASSIGNED" },
  ];
  assert.equal(outcomeSummary(results), "2 assigned, 1 skipped, 1 failed");
  assert.equal(outcomeSummary([]), "Nothing changed.");
  assert.equal(itemText(results[1]), "skipped: already assigned to this teacher");
  assert.equal(itemText({ outcome: "FAILED", code: "X", message: "Server said no" }), "failed: Server said no");
  assert.equal(itemText({ outcome: "REACTIVATED" }), "assigned again");
  assert.deepEqual(problemLines(results, (id) => (id === "c" ? "Ana K." : undefined)), [
    "Ana K. — failed: not a verified student of the teacher's schools — give a reason",
  ]);
});

test("teacher list: badges and abilities from the backend; older backends give none", () => {
  assert.deepEqual(accessBadges({ school: true, assigned: true }), ["School", "Assigned to you"]);
  assert.deepEqual(accessBadges(undefined), []);
  assert.deepEqual(abilities({ viewProfile: false, viewProgress: true, submitOnBehalf: true }), ["viewProgress", "submitOnBehalf"]);
  assert.equal(abilities(undefined), null);
});

test("pending students: a number only", () => {
  assert.equal(pendingText(0), null);
  assert.equal(pendingText(undefined), null);
  assert.match(pendingText(1), /^1 student of your schools is waiting/);
  assert.match(pendingText(4), /^4 students of your schools are waiting/);
});

test("assignment reason: optional unless needed; length checked when given", () => {
  assert.equal(assignReasonProblem("", false), null);
  assert.match(assignReasonProblem("  ", true), /Give a reason/);
  assert.match(assignReasonProblem("abc", false), /5–500/);
  assert.equal(assignReasonProblem("Camp group", true), null);
});
