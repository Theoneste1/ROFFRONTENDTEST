// Lists at scale: My Assignments server filter/sort mapping and the dashboard windows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { dayStart, monthWindow, serverListParams } from "../lib/assessment/my-assignments-query.ts";

test("the frontend knows the studentAssignmentFilters feature", () => {
  assert.ok(KNOWN_FEATURES.includes("studentAssignmentFilters"));
});

test("every status filter maps to the backend progress value; 'all' sends none", () => {
  assert.deepEqual(serverListParams("all", "deadline-asc"), {});
  const map = {
    "Not Started": "NOT_STARTED", Submitted: "SUBMITTED", "Pending Review": "PENDING_REVIEW",
    "Resubmission Requested": "RESUBMISSION_REQUESTED", Reviewed: "REVIEWED", Overdue: "OVERDUE",
  };
  for (const [label, progress] of Object.entries(map)) assert.deepEqual(serverListParams(label, "deadline-asc"), { progress });
});

test("sort maps to the backend; the default (soonest deadline) sends nothing", () => {
  assert.deepEqual(serverListParams("all", "deadline-desc"), { sort: "-deadline" });
  assert.deepEqual(serverListParams("all", "title"), { sort: "title" });
  assert.deepEqual(serverListParams("Overdue", "title"), { progress: "OVERDUE", sort: "title" });
});

test("the calendar asks for exactly the deadlines of the month shown", () => {
  const { deadlineFrom, deadlineTo } = monthWindow(new Date(2026, 1, 1)); // February 2026 (local)
  assert.equal(new Date(deadlineFrom).getTime(), new Date(2026, 1, 1).getTime());
  assert.equal(new Date(deadlineTo).getTime(), new Date(2026, 2, 1).getTime() - 1);
});

test("dashboard windows are stable within a day (stable query keys)", () => {
  const morning = new Date(2026, 10, 14, 8, 0).getTime();
  const evening = new Date(2026, 10, 14, 21, 30).getTime();
  assert.equal(dayStart(morning), dayStart(evening));
  assert.equal(new Date(dayStart(morning, -30)).getTime(), new Date(2026, 9, 15).getTime());
});
