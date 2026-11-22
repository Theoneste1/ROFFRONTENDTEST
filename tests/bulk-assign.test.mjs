// Bulk course assignment (lib/programmes/bulk-assign.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { bulkAssignChanges, bulkAssignInput, bulkAssignSummary } from "../lib/programmes/bulk-assign.ts";

test("All courses, one division's courses, or chosen pairs", () => {
  assert.deepEqual(bulkAssignInput("m", "ALL", [], []), { input: { mentorId: "m", scope: "ALL" } });
  assert.deepEqual(bulkAssignInput("m", "DIVISION:d1", [], []), { input: { mentorId: "m", scope: "DIVISION", divisionId: "d1" } });
  assert.deepEqual(bulkAssignInput("m", "PAIRS", ["c1", "c2"], ["d1"]), {
    input: { mentorId: "m", scope: "PAIRS", pairs: [{ courseId: "c1", divisionId: "d1" }, { courseId: "c2", divisionId: "d1" }] },
  });
  assert.equal(bulkAssignInput("m", "PAIRS", [], ["d1"]).problem, "Choose at least one course.");
  assert.equal(bulkAssignInput("m", "PAIRS", ["c1"], []).problem, "Choose at least one division.");
  assert.equal(bulkAssignInput("m", "DIVISION:", [], []).problem, "Choose a division.");
  assert.equal(bulkAssignInput("m", "", [], []).problem, "Choose what to assign.");
  const many = Array.from({ length: 101 }, (_, i) => `c${i}`);
  assert.match(bulkAssignInput("m", "PAIRS", many, ["a", "b", "c", "d", "e"]).problem, /at most 500/);
});

test("summary and whether anything changes", () => {
  assert.equal(bulkAssignSummary({ total: 6, new: 3, reactivate: 1, alreadyAssigned: 2, notOffered: 1 }), "3 new · 1 restored · 2 already assigned · 1 not offered");
  assert.equal(bulkAssignSummary({ total: 0, new: 0, reactivate: 0, alreadyAssigned: 0, notOffered: 0 }), "0 new");
  assert.equal(bulkAssignChanges({ total: 2, new: 0, reactivate: 0, alreadyAssigned: 2, notOffered: 0 }), false);
  assert.equal(bulkAssignChanges({ total: 2, new: 0, reactivate: 1, alreadyAssigned: 1, notOffered: 0 }), true);
});
