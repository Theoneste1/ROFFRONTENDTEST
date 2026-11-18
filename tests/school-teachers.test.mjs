// Teachers on the school page (lib/schools/school-teachers.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHOOL_TEACHER_FILTERS, assignmentPeriod, schoolTeachersVisible } from "../lib/schools/school-teachers.ts";

test("the tab needs users.manageTeachers", () => {
  assert.equal(schoolTeachersVisible((p) => p === "users.manageTeachers"), true);
  assert.equal(schoolTeachersVisible((p) => p === "schools.manage"), false);
});

test("filters: current first", () => {
  assert.deepEqual(SCHOOL_TEACHER_FILTERS.map((f) => f.value), ["current", "ended", "all"]);
});

test("period text", () => {
  const fmt = (iso) => iso.slice(0, 10);
  assert.equal(assignmentPeriod({ isActive: true, createdAt: "2026-11-03T08:00:00Z", endedAt: null }, fmt), "Since 2026-11-03");
  assert.equal(assignmentPeriod({ isActive: false, createdAt: "2026-11-03T08:00:00Z", endedAt: "2026-12-01T08:00:00Z" }, fmt), "2026-11-03 – 2026-12-01");
});
