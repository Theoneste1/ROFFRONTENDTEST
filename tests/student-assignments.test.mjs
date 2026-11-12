// Student assignments: states derived from backend fields, and submission errors.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ApiError } from "../lib/api/errors.ts";
import { assignmentTiming, matchesStatusFilter, studentAccessDenied, submitErrorMessage, submitErrorStale } from "../lib/assessment/student-state.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const PAST = "2026-11-10T17:00:00.000Z";
const FUTURE = "2026-11-20T17:00:00.000Z";
const a = (over) => ({ displayStatus: "Not Started", canSubmit: true, deadline: FUTURE, status: "PUBLISHED", ...over });

test("overdue: not started, the backend no longer accepts work, and the deadline passed or the assignment closed", () => {
  assert.equal(assignmentTiming(a({ canSubmit: false, deadline: PAST }), NOW), "overdue");
  assert.equal(assignmentTiming(a({ canSubmit: false, status: "CLOSED" }), NOW), "overdue");
  assert.equal(assignmentTiming(a({ canSubmit: false, deadline: FUTURE }), NOW), null, "not open for another reason: not called overdue");
});

test("late work accepted: not started, past the deadline, but canSubmit (allowLateSubmission)", () => {
  assert.equal(assignmentTiming(a({ canSubmit: true, deadline: PAST }), NOW), "lateAllowed");
  assert.equal(assignmentTiming(a({}), NOW), null);
});

test("submitted, reviewed or requested work is never 'overdue' (the backend label is shown instead)", () => {
  for (const s of ["Submitted", "Pending Review", "Resubmission Requested", "Reviewed"]) {
    assert.equal(assignmentTiming(a({ displayStatus: s, canSubmit: false, deadline: PAST }), NOW), null, s);
  }
});

test("status filter: backend labels as-is, plus the derived Overdue", () => {
  const overdue = a({ canSubmit: false, deadline: PAST });
  assert.equal(matchesStatusFilter(overdue, "Overdue", NOW), true);
  assert.equal(matchesStatusFilter(overdue, "Not Started", NOW), true);
  assert.equal(matchesStatusFilter(a({}), "Overdue", NOW), false);
  assert.equal(matchesStatusFilter(a({ displayStatus: "Reviewed" }), "Reviewed", NOW), true);
  assert.equal(matchesStatusFilter(a({}), "all", NOW), true);
});

test("submission errors: every backend refusal gets a plain message; state refusals refresh the page", () => {
  const e = (status, code) => new ApiError(status, code, "backend text");
  for (const [status, code] of [[400, "DEADLINE_PASSED"], [409, "ASSIGNMENT_CLOSED"], [400, "RESUBMISSION_NOT_ALLOWED"], [400, "RESUBMISSION_LIMIT_REACHED"], [400, "RESUBMISSION_WINDOW_CLOSED"], [409, "INVALID_STATE_TRANSITION"], [409, "ALREADY_SUBMITTED"], [400, "ANSWER_REQUIRED"], [400, "EMPTY_FILE"], [400, "TOO_MANY_FILES"], [400, "UPLOAD_REJECTED"], [403, "PERMISSION_REQUIRED"]]) {
    assert.ok(submitErrorMessage(e(status, code)), code);
  }
  assert.match(submitErrorMessage(e(413, "PAYLOAD_TOO_LARGE")), /20 MB/, "413 without the code");
  assert.match(submitErrorMessage(e(415, "UNSUPPORTED")), /accepted type/, "415 without the code");
  assert.equal(submitErrorMessage(e(500, "INTERNAL_ERROR")), null, "unknown errors fall back to the generic message");
  assert.equal(submitErrorStale(e(409, "INVALID_STATE_TRANSITION")), true);
  assert.equal(submitErrorStale(e(400, "DEADLINE_PASSED")), true);
  assert.equal(submitErrorStale(e(413, "FILE_TOO_LARGE")), false, "a file problem doesn't change the assignment");
  assert.equal(submitErrorMessage(new Error("x")), null);
});

test("access denied: 403 NO_DIVISION and other 403s are explained; 404/500 are not 'denied'", () => {
  assert.match(studentAccessDenied(new ApiError(403, "NO_DIVISION", "x")).title, /no division/);
  assert.ok(studentAccessDenied(new ApiError(403, "FORBIDDEN", "x")));
  assert.equal(studentAccessDenied(new ApiError(404, "NOT_FOUND", "x")), null);
  assert.equal(studentAccessDenied(new ApiError(500, "INTERNAL_ERROR", "x")), null);
});
