// Student Profile Overview (lib/accounts/student-overview.ts): portal links and status labels.
import { test } from "node:test";
import assert from "node:assert/strict";

import { accountStatusText, studentProfileHref } from "../lib/accounts/student-overview.ts";

test("each portal opens its own profile page", () => {
  assert.equal(studentProfileHref("ADMIN", "s1"), "/admin/profiles/s1");
  assert.equal(studentProfileHref("SUPER_ADMIN", "s1"), "/admin/profiles/s1");
  assert.equal(studentProfileHref("MENTOR", "s1"), "/mentor/profiles/s1");
  assert.equal(studentProfileHref("HEAD_COACH", "s1"), "/mentor/profiles/s1");
  assert.equal(studentProfileHref("TEACHER", "s1"), "/teacher/profiles/s1");
  assert.equal(studentProfileHref("STUDENT", "s/1"), "/student/profiles/s%2F1");
  assert.equal(studentProfileHref("SOMETHING", "s1"), null);
  assert.equal(studentProfileHref(undefined, "s1"), null);
});

test("status labels", () => {
  assert.equal(accountStatusText("SUSPENDED"), "Suspended");
  assert.equal(accountStatusText("NEW_STATE"), "NEW_STATE");
  assert.equal(accountStatusText(undefined), null);
});
