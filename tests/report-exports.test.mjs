// Reports page exports: each export gets the filters it applies; otherwise it is disabled with the reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { exportPlan } from "../lib/admin/report-exports.ts";

const ALL = { courseId: "c1", divisionId: "d1", from: "2026-10-15" };

test("the frontend knows the reportExportFilters feature", () => {
  assert.ok(KNOWN_FEATURES.includes("reportExportFilters"));
});

test("with reportExportFilters every filtered export receives course, division and period", () => {
  for (const key of ["students", "mentors", "enrollment", "course-participation", "assignments", "reviews", "results-publication", "results", "mentor-activity"]) {
    assert.deepEqual(exportPlan({ key }, ALL, true), { query: ALL }, key);
  }
});

test("results needs a course and a division; it is disabled with the reason, never sent without them", () => {
  for (const f of [{}, { courseId: "c1" }, { divisionId: "d1" }, { from: "2026-10-15" }]) {
    const p = exportPlan({ key: "results" }, f, true);
    assert.equal(p.query, undefined);
    assert.match(p.disabledReason, /course and a division/);
  }
});

test("an older backend: a period on results or a course on enrolment disables the export instead of being dropped", () => {
  assert.match(exportPlan({ key: "results" }, ALL, false).disabledReason, /period/);
  assert.deepEqual(exportPlan({ key: "results" }, { courseId: "c1", divisionId: "d1" }, false), { query: { courseId: "c1", divisionId: "d1" } });
  assert.match(exportPlan({ key: "enrollment" }, { courseId: "c1" }, false).disabledReason, /course/);
  assert.deepEqual(exportPlan({ key: "enrollment" }, { divisionId: "d1", from: "2026-10-15" }, false), { query: { divisionId: "d1", from: "2026-10-15" } });
  // Exports the older backend always filtered keep every filter.
  assert.deepEqual(exportPlan({ key: "students" }, ALL, false), { query: ALL });
});

test("unset filters are not sent; an unfiltered export says it ignores the selection", () => {
  assert.deepEqual(exportPlan({ key: "students" }, { courseId: undefined, divisionId: "", from: undefined }, true), { query: {} });
  assert.deepEqual(exportPlan({ key: "mentor-workload", noFilters: true }, {}, true), { query: {} });
  assert.deepEqual(exportPlan({ key: "mentor-workload", noFilters: true }, ALL, true), { query: {}, note: "All courses, divisions and dates" });
});
