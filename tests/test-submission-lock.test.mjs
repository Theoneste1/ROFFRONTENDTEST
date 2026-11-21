// Locked test submissions and teacher self-service (owner 2026-11-21; capability `testSubmissionLock`): the capability,
// the list action labels, the Administrator's reason check and the teacher sign-up result shape. The backend enforces
// every rule (the lock, who may unlock, the teacher's scope); the screens only show and send.
import { test } from "node:test";
import assert from "node:assert/strict";

import { answerActionLabel, resubmissionReasonProblem, submissionLockSupported, TESTS_AUTHORIZE_RESUBMISSION } from "../lib/test-management/submissions.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const detection = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("testSubmissionLock is a known feature; supported only when the backend advertises it", () => {
  assert.ok(KNOWN_FEATURES.includes("testSubmissionLock"));
  assert.equal(submissionLockSupported(detection(["testSubmissionLock"])), true);
  assert.equal(submissionLockSupported(detection(["testSubmissions"])), false);
  assert.equal(submissionLockSupported(null), false);
});

test("list action: Submit before any answer; Submit again only when an Administrator allowed it; otherwise View", () => {
  assert.equal(answerActionLabel(true, false, true), "Submit");
  assert.equal(answerActionLabel(true, true, true), "Submit again");
  assert.equal(answerActionLabel(false, true, true), "View");
  assert.equal(answerActionLabel(false, false, true), "View");
  // An older backend (no lock): replacing stays possible, as before.
  assert.equal(answerActionLabel(true, true, false), "Replace");
});

test("the resubmission / revocation reason: 3–500 characters after trimming", () => {
  assert.ok(resubmissionReasonProblem(""));
  assert.ok(resubmissionReasonProblem("  ab  "));
  assert.equal(resubmissionReasonProblem("Wrong file"), undefined);
  assert.equal(resubmissionReasonProblem("x".repeat(500)), undefined);
  assert.ok(resubmissionReasonProblem("x".repeat(501)));
  assert.equal(TESTS_AUTHORIZE_RESUBMISSION, "tests.authorizeResubmission");
});
