// Primary teacher of a school (lib/schools/primary-teacher.ts; owner decision 2026-11-19).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_PRIMARY_TEACHER, TEACHER_ROLE_BADGE, TEACHER_ROLE_LABEL, canMakePrimary, displayedRole, makePrimaryText, primaryTeacherLine, primaryTeacherSupported,
} from "../lib/schools/primary-teacher.ts";

const NEW = (features) => ({ state: "NEW", roles: [], features });

test("only backends advertising primaryTeacher", () => {
  assert.equal(primaryTeacherSupported(NEW(["primaryTeacher"])), true);
  assert.equal(primaryTeacherSupported(NEW(["teacherStudentAccess"])), false);
  assert.equal(primaryTeacherSupported({ state: "LEGACY" }), false);
  assert.equal(primaryTeacherSupported(null), false);
});

test("the role shown: active links only; nothing from an older backend", () => {
  assert.equal(displayedRole({ isActive: true, role: "PRIMARY" }), "PRIMARY");
  assert.equal(displayedRole({ isActive: true, role: "SECONDARY" }), "SECONDARY");
  assert.equal(displayedRole({ isActive: false, role: "SECONDARY" }), null);
  assert.equal(displayedRole({ isActive: true }), null);
});

test("labels and badges never call a teacher 'verified'", () => {
  assert.deepEqual(TEACHER_ROLE_LABEL, { PRIMARY: "Primary", SECONDARY: "Secondary" });
  for (const v of [...Object.values(TEACHER_ROLE_LABEL), NO_PRIMARY_TEACHER]) assert.doesNotMatch(v, /verified/i);
  // AA contrast pairs: dark text (700) on a 50/100 background.
  assert.match(TEACHER_ROLE_BADGE.PRIMARY, /text-indigo-700/);
  assert.match(TEACHER_ROLE_BADGE.SECONDARY, /text-gray-700/);
});

test("'Make primary' only for an active secondary teacher, only for users.manageTeachers", () => {
  assert.equal(canMakePrimary({ isActive: true, role: "SECONDARY" }, true), true);
  assert.equal(canMakePrimary({ isActive: true, role: "SECONDARY" }, false), false);
  assert.equal(canMakePrimary({ isActive: true, role: "PRIMARY" }, true), false);
  assert.equal(canMakePrimary({ isActive: false, role: "SECONDARY" }, true), false);
  assert.equal(canMakePrimary({ isActive: true }, true), false);
});

test("the confirm text names who changes and says permissions do not", () => {
  assert.equal(
    makePrimaryText("Ann B", "Carl D", "GS Ngoma"),
    "Ann B becomes the primary teacher (main contact) of GS Ngoma. Carl D becomes a secondary teacher. Permissions do not change: every teacher of the school keeps the same rights.",
  );
  assert.match(makePrimaryText("Ann B", null, "GS Ngoma"), /^Ann B becomes the primary teacher \(main contact\) of GS Ngoma\. Permissions do not change/);
});

test("the school's primary teacher line", () => {
  assert.equal(primaryTeacherLine({ firstName: "Ann", lastName: "B" }), "Ann B");
  assert.equal(primaryTeacherLine(null), "No primary teacher");
});
