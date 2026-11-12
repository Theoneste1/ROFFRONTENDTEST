// Teacher "submit on behalf": the UI hides the action only where the backend
// (SubmissionsService.submit, develop 9fd1942) would certainly refuse it.
import { test } from "node:test";
import assert from "node:assert/strict";

import { onBehalfEligibility } from "../lib/teacher/on-behalf.ts";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");
const FUTURE = "2026-12-01T17:00:00.000Z";
const PAST = "2026-11-01T17:00:00.000Z";
const base = { status: "PUBLISHED", deadline: FUTURE, allowResubmission: true, maxResubmissions: 2, allowLateSubmission: false, submission: null };
const sub = (status, revisionCount = 0) => ({ status, revisionCount });
const check = (over) => onBehalfEligibility({ ...base, ...over }, NOW);
const allowed = (over) => assert.deepEqual(check(over), { allowed: true });
const refused = (over, pattern) => {
  const r = check(over);
  assert.equal(r.allowed, false, JSON.stringify(over));
  assert.match(r.reason, pattern);
};

test("first submission: allowed before the deadline, and after it only when late work is accepted", () => {
  allowed({});
  refused({ deadline: PAST }, /deadline has passed/);
  allowed({ deadline: PAST, allowLateSubmission: true });
});

test("closed assignment: refused, unless the coach requested a resubmission", () => {
  refused({ status: "CLOSED" }, /closed/);
  refused({ status: "CLOSED", submission: sub("SUBMITTED") }, /closed/);
  allowed({ status: "CLOSED", submission: sub("RESUBMISSION_REQUESTED", 0) });
});

test("replacing work: expired deadline, disabled resubmission and exhausted attempts are refused", () => {
  allowed({ submission: sub("SUBMITTED", 0) });
  refused({ submission: sub("SUBMITTED", 0), deadline: PAST, allowLateSubmission: true }, /deadline has passed/);
  refused({ submission: sub("SUBMITTED", 0), allowResubmission: false }, /does not allow resubmissions/);
  refused({ submission: sub("SUBMITTED", 2), maxResubmissions: 2 }, /maximum number of resubmissions/);
  allowed({ submission: sub("SUBMITTED", 1), maxResubmissions: 2 });
  allowed({ submission: sub("SUBMITTED", 9), maxResubmissions: 0 }, "0 means no limit");
});

test("work under review or later can no longer be replaced; SUBMITTED and ASSIGNED can", () => {
  allowed({ submission: sub("ASSIGNED") });
  for (const s of ["IN_REVIEW", "MARKED", "SUBMITTED_TO_ADMIN", "APPROVED", "PUBLISHED", "REJECTED"]) {
    refused({ submission: sub(s) }, /already under review/);
  }
});

test("requested resubmission: only the attempt limit is decided here (the request's own deadline is the backend's)", () => {
  allowed({ submission: sub("RESUBMISSION_REQUESTED", 1), deadline: PAST, allowResubmission: false });
  refused({ submission: sub("RESUBMISSION_REQUESTED", 2), maxResubmissions: 2 }, /maximum number of resubmissions/);
});

test("the deadline is compared like the backend: late only strictly after it", () => {
  assert.deepEqual(onBehalfEligibility({ ...base, deadline: new Date(NOW).toISOString() }, NOW), { allowed: true });
  assert.equal(onBehalfEligibility({ ...base, deadline: new Date(NOW - 1).toISOString() }, NOW).allowed, false);
});
