// Academic years admin: form validation (backend DTO rules), changes, current year, summaries.
import { test } from "node:test";
import assert from "node:assert/strict";

import { activationSummary, currentYear, dayOf, formatDay, validateYearForm, yearChanges } from "../lib/admin/academic-years.ts";
import { ADMIN_NAV, canSeeNavItem } from "../lib/auth/navigation.ts";

const year = (over = {}) => ({ id: "y1", name: "2026-2027", startsOn: "2026-09-01T00:00:00.000Z", endsOn: "2027-07-15T00:00:00.000Z", status: "PLANNED", isCurrent: null, closedAt: null, createdAt: "", updatedAt: "", ...over });

test("form: name 4–30 characters, both dates, last day after first day (as the backend DTO and INVALID_DATE_RANGE)", () => {
  assert.deepEqual(validateYearForm({ name: "2027-2028", startsOn: "2027-09-01", endsOn: "2028-07-15" }), {});
  assert.ok(validateYearForm({ name: "27", startsOn: "2027-09-01", endsOn: "2028-07-15" }).name);
  assert.ok(validateYearForm({ name: "x".repeat(31), startsOn: "2027-09-01", endsOn: "2028-07-15" }).name);
  assert.ok(validateYearForm({ name: "2027-2028", startsOn: "", endsOn: "2028-07-15" }).startsOn);
  assert.match(validateYearForm({ name: "2027-2028", startsOn: "2027-09-01", endsOn: "2027-09-01" }).endsOn, /after/);
  assert.match(validateYearForm({ name: "2027-2028", startsOn: "2027-09-01", endsOn: "2027-08-01" }).endsOn, /after/);
});

test("dates: the backend's date-only values never shift a day", () => {
  assert.equal(dayOf("2026-09-01T00:00:00.000Z"), "2026-09-01");
  assert.equal(formatDay("2026-09-01T00:00:00.000Z"), "1 Sept 2026".replace("Sept", new Date(Date.UTC(2026, 8, 1)).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })));
});

test("edit sends only what changed", () => {
  const y = year();
  assert.deepEqual(yearChanges(y, { name: "2026-2027", startsOn: "2026-09-01", endsOn: "2027-07-15" }), {});
  assert.deepEqual(yearChanges(y, { name: " 2026/27 ", startsOn: "2026-09-01", endsOn: "2027-07-31" }), { name: "2026/27", endsOn: "2027-07-31" });
});

test("current year: the ACTIVE / isCurrent one, or none", () => {
  assert.equal(currentYear([year({ id: "a", status: "CLOSED" }), year({ id: "b", status: "ACTIVE", isCurrent: true })]).id, "b");
  assert.equal(currentYear([year(), year({ id: "c", status: "CLOSED" })]), null);
});

test("activation summary lists only what happened, in plain words", () => {
  const lines = activationSummary({ academicYear: year({ name: "2027-2028" }), promoted: 120, carriedOver: 0, graduated: 1, newlyEnrolled: 3, assignmentsArchived: 14 });
  assert.deepEqual(lines, [
    "2027-2028 is now the current academic year.",
    "120 students were moved up one grade.",
    "1 S6 student graduated.",
    "3 students without an enrolment were enrolled.",
    "14 assignments of the previous year archived.",
  ]);
});

test("menu: Academic Years needs academicYears.manage (in the Administrator's list on every backend)", () => {
  const item = ADMIN_NAV.find((i) => i.href === "/admin/academic-years");
  assert.equal(item?.permission, "academicYears.manage");
  assert.equal(canSeeNavItem(item, new Set(["academicYears.manage"])), true);
  assert.equal(canSeeNavItem(item, new Set(["users.manage"])), false);
});
