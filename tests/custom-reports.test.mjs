// Custom reports (lib/reports/custom-reports.ts): conditions, checks, access levels, cells and templates.
import { test } from "node:test";
import assert from "node:assert/strict";

import { REPORT_TEMPLATES, cellText, definitionProblems, grantInputs, levelsText, needsValue, normaliseLevels, opsFor, saveProblems, templateDefinition } from "../lib/reports/custom-reports.ts";

const SOURCE = {
  key: "STUDENTS",
  label: "Students",
  fields: [
    { key: "fullName", label: "Full name", type: "text", values: null, filterable: true, sortable: true },
    { key: "registeredAt", label: "Registration date", type: "date", values: null, filterable: true, sortable: true },
    { key: "coachCourses", label: "Courses", type: "text", values: null, filterable: false, sortable: false },
    { key: "neverLoggedIn", label: "Never logged in", type: "boolean", values: null, filterable: true, sortable: false },
  ],
};

test("conditions follow the field type", () => {
  assert.deepEqual(opsFor({ key: "fullName", type: "text" }), ["contains"]);
  assert.deepEqual(opsFor({ key: "email", type: "text" }), ["contains", "eq", "neq", "isEmpty", "isNotEmpty"]);
  assert.deepEqual(opsFor({ key: "registeredAt", type: "date" }), ["gte", "lte", "isEmpty", "isNotEmpty"]);
  assert.deepEqual(opsFor({ key: "neverLoggedIn", type: "boolean" }), ["eq"]);
  assert.deepEqual(opsFor({ key: "olympiadLevel", type: "text" }), ["eq", "in"]);
  assert.equal(needsValue("isEmpty"), false);
  assert.equal(needsValue("contains"), true);
});

test("a definition needs a source, columns, values for its conditions, and sortable sorts", () => {
  const ok = { source: "STUDENTS", columns: ["fullName"], filters: [{ field: "neverLoggedIn", op: "eq", value: true }], sort: [{ field: "fullName", dir: "asc" }] };
  assert.deepEqual(definitionProblems(ok, SOURCE), []);
  assert.deepEqual(definitionProblems(ok, undefined), ["Choose what the report lists."]);
  assert.deepEqual(definitionProblems({ ...ok, columns: [] }, SOURCE), ["Choose at least one column."]);
  assert.deepEqual(definitionProblems({ ...ok, filters: [{ field: "fullName", op: "contains", value: "" }] }, SOURCE), ["Give a value for “Full name contains”."]);
  assert.deepEqual(definitionProblems({ ...ok, filters: [{ field: "coachCourses", op: "contains", value: "x" }] }, SOURCE), ["Courses cannot be filtered."]);
  assert.deepEqual(definitionProblems({ ...ok, sort: [{ field: "coachCourses", dir: "asc" }] }, SOURCE), ["coachCourses cannot be sorted."]);
  assert.equal(saveProblems(" a "), "Give the report a name of 2–120 characters.");
  assert.equal(saveProblems("Students by school"), undefined);
});

test("access levels: All = View + Download + Edit; Download or Edit include View", () => {
  assert.deepEqual(normaliseLevels({ canView: false, canDownload: true, canEdit: false }), { canView: true, canDownload: true, canEdit: false });
  assert.equal(levelsText({ canView: true, canDownload: true, canEdit: true }), "All");
  assert.equal(levelsText({ canView: false, canDownload: false, canEdit: true }), "View, Edit");
  assert.equal(levelsText({ canView: false, canDownload: false, canEdit: false }), "No access");
  const user = { id: "u1", firstName: "A", lastName: "B", username: "ab", role: "MENTOR" };
  assert.deepEqual(
    grantInputs([
      { role: null, user, canView: false, canDownload: true, canEdit: false },
      { role: "TEACHER", user: null, canView: true, canDownload: false, canEdit: false },
      { role: "HEAD_COACH", user: null, canView: false, canDownload: false, canEdit: false },
    ]),
    [{ userId: "u1", canView: true, canDownload: true, canEdit: false }, { role: "TEACHER", canView: true, canDownload: false, canEdit: false }],
  );
});

test("cells", () => {
  assert.equal(cellText(null), "—");
  assert.equal(cellText(true), "Yes");
  assert.equal(cellText(false), "No");
  assert.equal(cellText("2026-11-22T10:00:00.000Z", "date"), "2026-11-22");
  assert.equal(cellText(3), "3");
});

test("templates are valid starting points; Recently registered covers the last 30 days", () => {
  assert.ok(REPORT_TEMPLATES.length >= 6);
  const recent = templateDefinition(REPORT_TEMPLATES.find((t) => t.name === "Recently registered"), new Date("2026-11-22T12:00:00Z"));
  assert.deepEqual(recent.filters, [{ field: "registeredAt", op: "gte", value: "2026-10-23" }]);
  // The template itself is not changed.
  assert.equal(REPORT_TEMPLATES.find((t) => t.name === "Recently registered").definition.filters[0].value, "");
});

test("menu: the backend feature, and reports.build for the builders' entry", async () => {
  const { customReportsNavVisible } = await import("../lib/reports/custom-reports.ts");
  const on = { state: "NEW", schemaVersion: 1, roles: [], features: ["customReports"] };
  assert.equal(customReportsNavVisible(on, new Set(["reports.build"]), true), true);
  assert.equal(customReportsNavVisible(on, new Set([]), true), false);
  assert.equal(customReportsNavVisible(on, null, false), true);
  assert.equal(customReportsNavVisible({ ...on, features: [] }, new Set(["reports.build"]), true), false);
  assert.equal(customReportsNavVisible({ state: "LEGACY" }, null, false), false);
});
