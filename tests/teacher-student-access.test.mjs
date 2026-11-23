// Teacher–student access (TS-1…TS-6) — lib/accounts/teacher-student-access.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abilities, accessBadges, assignReasonProblem, delegationNote, homeworkDefaultSupported, itemText, offeredDelegations, outcomeSummary, pendingText, problemLines, scopeText,
  teacherStudentAccessSupported,
} from "../lib/accounts/teacher-student-access.ts";
import { TEACHER_DELEGATIONS } from "../lib/api/accounts.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("course homework by default (owner 2026-11-24): only on backends with teacherHomeworkDefault", () => {
  assert.equal(homeworkDefaultSupported(NEW(["teacherHomeworkDefault"])), true);
  assert.equal(homeworkDefaultSupported(NEW(["teacherStudentAccess"])), false);
  assert.equal(homeworkDefaultSupported({ state: "LEGACY" }), false);
  assert.equal(homeworkDefaultSupported(undefined), false);
  assert.equal(homeworkDefaultSupported(null), false);
});

test("the delegation picker stops offering progress and handing in once they are teacher defaults; older backends keep all three", () => {
  assert.deepEqual(offeredDelegations(TEACHER_DELEGATIONS, NEW(["teacherHomeworkDefault"])), ["students.viewProfile"]);
  assert.deepEqual(offeredDelegations(TEACHER_DELEGATIONS, NEW([])), ["students.viewProfile", "students.viewProgress", "submissions.submitOnBehalf"]);
  assert.deepEqual(offeredDelegations(TEACHER_DELEGATIONS, { state: "LEGACY" }), [...TEACHER_DELEGATIONS]);
  assert.deepEqual(offeredDelegations(TEACHER_DELEGATIONS, undefined), [...TEACHER_DELEGATIONS]);
});

test("an existing progress / hand-in delegation stays listed with a plain note so it can be revoked; the profile one has no note", () => {
  const on = NEW(["teacherHomeworkDefault"]);
  for (const p of ["students.viewProgress", "submissions.submitOnBehalf"]) {
    assert.equal(delegationNote(p, on), "Every teacher has this now (course homework). This older permission adds nothing and can be revoked.");
    assert.equal(delegationNote(p, NEW([])), null);
  }
  assert.equal(delegationNote("students.viewProfile", on), null);
});

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

import { grantSelected, refusedStudentIds } from "../lib/accounts/teacher-student-access.ts";

const notSeen = (ids) => Object.assign(new Error("not seen"), { status: 400, code: "STUDENT_NOT_IN_TEACHER_SCOPE", details: { studentIds: ids } });

test("refused students are read from 400 STUDENT_NOT_IN_TEACHER_SCOPE only", () => {
  assert.deepEqual(refusedStudentIds(notSeen(["a", "b"])), ["a", "b"]);
  assert.equal(refusedStudentIds({ status: 409, code: "STUDENT_NOT_IN_TEACHER_SCOPE", details: { studentIds: ["a"] } }), null);
  assert.equal(refusedStudentIds({ status: 400, code: "VALIDATION_FAILED" }), null);
  assert.equal(refusedStudentIds(null), null);
});

test("giving a permission to selected students: refused ones fail, the rest is given in a second request", async () => {
  const calls = [];
  const grant = async (ids) => { calls.push(ids); if (ids.includes("b")) throw notSeen(["b"]); };
  const out = await grantSelected(["a", "b", "c"], grant, (e) => e.message);
  assert.deepEqual(calls, [["a", "b", "c"], ["a", "c"]]);
  assert.deepEqual(out.map((r) => [r.studentId, r.outcome]), [["b", "FAILED"], ["a", "ADDED"], ["c", "ADDED"]]);
  assert.equal(out[0].code, "STUDENT_NOT_IN_TEACHER_SCOPE");
});

test("giving a permission: every student refused means nothing is given and every one is reported", async () => {
  const calls = [];
  const out = await grantSelected(["a", "b"], async (ids) => { calls.push(ids); throw notSeen(["a", "b"]); }, (e) => e.message);
  assert.equal(calls.length, 1);
  assert.deepEqual(out.map((r) => r.outcome), ["FAILED", "FAILED"]);
});

test("giving a permission: another error is thrown at first, reported on the rest after a refusal", async () => {
  await assert.rejects(grantSelected(["a"], async () => { throw Object.assign(new Error("boom"), { status: 500 }); }, (e) => e.message), /boom/);
  let n = 0;
  const out = await grantSelected(["a", "b"], async () => { n++; if (n === 1) throw notSeen(["a"]); throw new Error("down"); }, (e) => e.message);
  assert.deepEqual(out.map((r) => [r.studentId, r.outcome, r.message]), [["a", "FAILED", "The teacher does not see this student."], ["b", "FAILED", "down"]]);
});
