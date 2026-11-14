// M2: the coach's per-assignment review list — server mode (reviewQueueFilters) and legacy mode.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KNOWN_FEATURES, hasFeature } from "../lib/api/capabilities.ts";
import {
  DONE_STATUSES, LEGACY_LIMIT, OPEN_STATUSES, REVIEW_PAGE_SIZE, legacyCounts, legacyRows, serverQuery,
} from "../lib/mentor/review-queue.ts";

const sub = (id, first, last, status, submittedAt, score) => ({
  id, status, submittedAt, student: { firstName: first, lastName: last, username: `${first}.${last}`.toLowerCase() },
  review: score === undefined ? null : { score },
});
const ROWS = [
  sub("a", "Ada", "Uwase", "ASSIGNED", "2026-11-01T10:00:00Z"),
  sub("b", "Ben", "Mugisha", "SUBMITTED_TO_ADMIN", "2026-11-03T10:00:00Z", 18),
  sub("c", "Cyn", "Ishimwe", "RESUBMISSION_REQUESTED", "2026-11-02T10:00:00Z", 9),
  sub("d", "Dan", "Habimana", "PUBLISHED", "2026-11-04T10:00:00Z", 20),
];

test("the frontend knows the reviewQueueFilters feature; it is used only when a NEW backend lists it", () => {
  assert.ok(KNOWN_FEATURES.includes("reviewQueueFilters"));
  assert.equal(hasFeature({ state: "NEW", schemaVersion: 1, roles: [], features: ["reviewQueueFilters"] }, "reviewQueueFilters"), true);
  assert.equal(hasFeature({ state: "NEW", schemaVersion: 1, roles: [], features: [] }, "reviewQueueFilters"), false);
  assert.equal(hasFeature({ state: "LEGACY" }, "reviewQueueFilters"), false);
  assert.equal(hasFeature(undefined, "reviewQueueFilters"), false);
});

test("server mode: groups and single statuses map to the backend's parameters; newest first for 'Submitted date'", () => {
  const base = { search: "", sort: "submitted" };
  assert.deepEqual(serverQuery("as1", { ...base, status: "all" }, 1), { assignmentId: "as1", group: "all", sort: "recent", page: 1, limit: REVIEW_PAGE_SIZE });
  assert.equal(serverQuery("as1", { ...base, status: "open" }, 1).group, "open");
  assert.equal(serverQuery("as1", { ...base, status: "done" }, 1).group, "done");
  const single = serverQuery("as1", { ...base, status: "PUBLISHED" }, 3);
  assert.equal(single.status, "PUBLISHED");
  assert.equal(single.group, undefined);
  assert.equal(single.page, 3);
  assert.equal(serverQuery("as1", { ...base, status: "all", sort: "name" }, 1).sort, "name");
  assert.equal(serverQuery("as1", { ...base, status: "all", sort: "score" }, 1).sort, "score");
});

test("server mode: the search is trimmed, capped at 100 characters, and omitted when empty", () => {
  assert.equal(serverQuery("as1", { search: "  ada  ", status: "all", sort: "submitted" }, 1).q, "ada");
  assert.equal("q" in serverQuery("as1", { search: "   ", status: "all", sort: "submitted" }, 1), false);
  assert.equal(serverQuery("as1", { search: "x".repeat(150), status: "all", sort: "submitted" }, 1).q.length, 100);
});

test("groups match the backend (open includes a requested resubmission; done includes approved and published)", () => {
  assert.deepEqual([...OPEN_STATUSES], ["ASSIGNED", "IN_REVIEW", "MARKED", "REJECTED", "RESUBMISSION_REQUESTED"]);
  assert.deepEqual([...DONE_STATUSES], ["SUBMITTED_TO_ADMIN", "APPROVED", "PUBLISHED"]);
});

test("legacy mode (older backend): unchanged in-browser search, filter and sort of the loaded page", () => {
  assert.equal(LEGACY_LIMIT, 100);
  const all = { search: "", status: "all", sort: "submitted" };
  assert.deepEqual(legacyRows(ROWS, all).map((s) => s.id), ["d", "b", "c", "a"]);
  assert.deepEqual(legacyRows(ROWS, { ...all, status: "open" }).map((s) => s.id), ["c", "a"]);
  assert.deepEqual(legacyRows(ROWS, { ...all, status: "done" }).map((s) => s.id), ["d", "b"]);
  assert.deepEqual(legacyRows(ROWS, { ...all, sort: "name" }).map((s) => s.id), ["a", "b", "c", "d"]);
  assert.deepEqual(legacyRows(ROWS, { ...all, sort: "score" }).map((s) => s.id), ["d", "b", "c", "a"]);
  assert.deepEqual(legacyRows(ROWS, { ...all, search: "mugisha" }).map((s) => s.id), ["b"]);
  assert.deepEqual(legacyCounts(ROWS), { open: 2, done: 2, all: 4 });
});
