// Academic years admin: form validation (backend DTO rules), changes, current year, summaries.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVATION_LOCK_KEY,
  ACTIVATION_LOCK_MS,
  activationLockState,
  activationOutcomeUnknown,
  activationSummary,
  clearActivationLock,
  currentYear,
  dayOf,
  formatDay,
  readActivationLock,
  validateYearForm,
  writeActivationLock,
  yearChanges,
} from "../lib/admin/academic-years.ts";
import { ApiError } from "../lib/api/errors.ts";
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

test("dates: the backend's date-only values never shift a day, in any time zone (fixed expected values)", () => {
  const before = process.env.TZ;
  try {
    for (const tz of ["Pacific/Honolulu", "Africa/Kigali", "Pacific/Kiritimati", "UTC"]) {
      process.env.TZ = tz; // UTC-10, UTC+2 (Rwanda), UTC+14
      assert.equal(dayOf("2026-09-01T00:00:00.000Z"), "2026-09-01", tz);
      assert.match(formatDay("2026-09-01T00:00:00.000Z"), /^1 Sept? 2026$/, tz);
      assert.match(formatDay("2027-07-15T00:00:00.000Z"), /^15 Jul 2027$/, tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
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

// ─── Starting a year: the uncertain-outcome lock (D1) ───────────────────────

const T0 = 1_800_000_000_000;
const LOCK = { yearId: "y1", yearName: "2026-2027", startedAt: T0 };
const planned = [year({ id: "y1", status: "PLANNED" }), year({ id: "y0", name: "2025-2026", status: "ACTIVE", isCurrent: true })];
const started = [year({ id: "y1", status: "ACTIVE", isCurrent: true }), year({ id: "y0", name: "2025-2026", status: "CLOSED" })];

test("lock: no lock → nothing locked", () => {
  assert.deepEqual(activationLockState(null, planned, T0, T0), { kind: "none" });
});

test("lock: a list still showing PLANNED inside the window proves nothing — stays locked until the window ends", () => {
  const s = activationLockState(LOCK, planned, T0 + 1_000, T0 + 2_000);
  assert.equal(s.kind, "waiting");
  assert.equal(s.until, T0 + ACTIVATION_LOCK_MS);
  assert.equal(activationLockState(LOCK, planned, T0 + 120_000, T0 + 125_000).kind, "waiting", "just after the backend's own 120 s limit");
  assert.equal(activationLockState(LOCK, planned, T0 + ACTIVATION_LOCK_MS - 10_000, T0 + ACTIVATION_LOCK_MS - 1).kind, "waiting", "1 ms before the end");
  assert.ok(ACTIVATION_LOCK_MS >= 120_000 + 180_000, "covers the 120 s transaction plus a Render cold start before it opens");
});

test("lock: the year shown ACTIVE in a list fetched after the request → succeeded (even inside the window)", () => {
  assert.equal(activationLockState(LOCK, started, T0 + 5_000, T0 + 6_000).kind, "succeeded");
  assert.equal(activationLockState(LOCK, started, T0 - 1, T0 + 6_000).kind, "waiting", "a list from before the request can't show the outcome");
});

test("lock: after the window, only a list fetched after the window can release it", () => {
  const end = T0 + ACTIVATION_LOCK_MS;
  assert.equal(activationLockState(LOCK, planned, end - 1, end + 5_000).kind, "waiting", "list fetched just before the window ended");
  assert.equal(activationLockState(LOCK, planned, end + 1, end + 5_000).kind, "expired");
  assert.equal(activationLockState(LOCK, undefined, 0, end + 5_000).kind, "waiting", "no list yet");
});

test("outcome: only a backend 4xx is a definite refusal; no answer, timeouts and 5xx are unknown", () => {
  assert.equal(activationOutcomeUnknown(new ApiError(409, "INVALID_STATE_TRANSITION", "x")), false);
  assert.equal(activationOutcomeUnknown(new ApiError(404, "NOT_FOUND", "x")), false);
  assert.equal(activationOutcomeUnknown(new ApiError(400, "VALIDATION_FAILED", "x")), false);
  assert.equal(activationOutcomeUnknown(new ApiError(504, "GATEWAY_TIMEOUT", "x")), true);
  assert.equal(activationOutcomeUnknown(new ApiError(502, "BAD_GATEWAY", "x")), true);
  assert.equal(activationOutcomeUnknown(new ApiError(500, "INTERNAL_ERROR", "x")), true);
  assert.equal(activationOutcomeUnknown(new ApiError(408, "TIMEOUT", "x")), true);
  assert.equal(activationOutcomeUnknown(new ApiError(0, "NETWORK_ERROR", "x")), true);
  assert.equal(activationOutcomeUnknown(new TypeError("Failed to fetch")), true);
});

test("lock storage: written, read back, cleared; malformed values are ignored", () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  writeActivationLock(storage, LOCK);
  assert.deepEqual(readActivationLock(storage), LOCK);
  clearActivationLock(storage);
  assert.equal(readActivationLock(storage), null);
  m.set(ACTIVATION_LOCK_KEY, "{not json");
  assert.equal(readActivationLock(storage), null);
  m.set(ACTIVATION_LOCK_KEY, JSON.stringify({ yearId: 1 }));
  assert.equal(readActivationLock(storage), null);
});

// ─── Start-year availability (academicYearActivation) ───────────────────────
import { startYearAvailability, YEAR_ERRORS as YE, activationSummary as summary } from "../lib/admin/academic-years.ts";

test("Start year is offered only when the backend advertises academicYearActivation", () => {
  const NEWB = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
  assert.equal(startYearAvailability(NEWB(["academicYearActivation"])), "available");
  assert.equal(startYearAvailability(NEWB(["schoolAdministration"])), "unavailable", "new backend without the fix");
  assert.equal(startYearAvailability({ state: "LEGACY" }), "unavailable", "production today");
  assert.equal(startYearAvailability({ state: "UNKNOWN", reason: "timeout" }), "unavailable");
  assert.equal(startYearAvailability(undefined), "checking");
});

test("the start's new refusals and a replayed answer are explained", () => {
  assert.match(YE.CURRENT_YEAR_CHANGED, /current academic year changed/);
  assert.match(YE.ACTIVATION_OPTIONS_DIFFER, /different choices/);
  const y = { id: "y", name: "2027-2028" };
  const base = { academicYear: y, promoted: 3, carriedOver: 0, graduated: 1, newlyEnrolled: 0, assignmentsArchived: 0 };
  assert.ok(!summary(base).some((l) => /already been started/.test(l)));
  assert.ok(summary({ ...base, replayed: true }).some((l) => /already been started/.test(l)));
});
