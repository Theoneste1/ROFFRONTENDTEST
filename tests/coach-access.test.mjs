// Coaches across their programmes (lib/coaches/coach-access.ts): wording, checks, menu entries.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAPABILITY_TEXT, COACH_CAPABILITIES, coachNavVisible, coachProgrammeAccessSupported, removalReasonProblem, removedText,
} from "../lib/coaches/coach-access.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { MENTOR_RESULTS, MENTOR_STUDENTS } from "../lib/auth/navigation.ts";

const det = (features) => ({ state: "NEW", features });

test("the four parts, each with plain words", () => {
  assert.deepEqual([...COACH_CAPABILITIES], ["STUDENTS", "COURSES", "MARKING", "RESULTS"]);
  for (const c of COACH_CAPABILITIES) {
    assert.ok(CAPABILITY_TEXT[c].label.length > 5);
    assert.ok(CAPABILITY_TEXT[c].hint.length > 10);
  }
  assert.match(CAPABILITY_TEXT.STUDENTS.hint, /never contact details/);
  assert.match(CAPABILITY_TEXT.MARKING.hint, /anonymous/);
});

test("a reason is needed to take something away (3–500 characters), said plainly", () => {
  assert.match(removalReasonProblem("  ") ?? "", /Give a reason/);
  assert.match(removalReasonProblem("x".repeat(501)) ?? "", /under 500/);
  assert.equal(removalReasonProblem("Conflict of interest"), undefined);
});

test("who took it away, when, and why", () => {
  const text = removedText({ reason: "Conflict of interest", at: "2026-11-23T08:00:00Z", by: { id: "1", firstName: "Jane", lastName: "Doe" } }, () => "23 Nov 2026");
  assert.equal(text, "Taken away by Jane Doe on 23 Nov 2026: Conflict of interest");
  assert.match(removedText({ reason: "r", at: "x", by: null }, () => "d"), /by an administrator/);
});

test("menu entries: the backend feature and the known permission", () => {
  assert.ok(KNOWN_FEATURES.includes("coachProgrammeAccess"));
  assert.equal(coachProgrammeAccessSupported(det(["coachProgrammeAccess"])), true);
  assert.equal(coachProgrammeAccessSupported(det([])), false);
  assert.equal(MENTOR_STUDENTS.href, "/mentor/students");
  assert.equal(MENTOR_RESULTS.href, "/mentor/results");
  const perms = new Set(["students.viewProgramme"]);
  assert.equal(coachNavVisible(det(["coachProgrammeAccess"]), perms, MENTOR_STUDENTS.permission), true);
  assert.equal(coachNavVisible(det(["coachProgrammeAccess"]), perms, MENTOR_RESULTS.permission), false);
  assert.equal(coachNavVisible(det([]), perms, MENTOR_STUDENTS.permission), false);
  assert.equal(coachNavVisible(det(["coachProgrammeAccess"]), null, MENTOR_STUDENTS.permission), false);
});
