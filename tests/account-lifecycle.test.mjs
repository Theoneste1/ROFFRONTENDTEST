// Admin user page: account status and lifecycle actions (lib/accounts/account-lifecycle.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { displayStatus, lifecycleActions, STATUS_REASON, stillBlockedText } from "../lib/accounts/account-lifecycle.ts";

const active = { isActive: true, isApproved: true, activatedAt: "2026-11-01T00:00:00Z" };
const states = (s) => ({ ...active, isActive: s === "ACTIVE", accountStatus: s });

test("displayStatus: the backend's account state wins; otherwise the old flags, in order", () => {
  assert.equal(displayStatus(states("ARCHIVED")), "ARCHIVED");
  assert.equal(displayStatus(states("DEACTIVATED")), "DEACTIVATED");
  assert.equal(displayStatus(states("SUSPENDED")), "SUSPENDED");
  assert.equal(displayStatus(states("ACTIVE")), "ACTIVE");
  // No accountStatus (older backend): as before.
  assert.equal(displayStatus({ ...active, isActive: false }), "SUSPENDED");
  assert.equal(displayStatus({ ...active, activatedAt: null }), "AWAITING_SETUP");
  assert.equal(displayStatus({ ...active, isApproved: false }), "AWAITING_APPROVAL");
  assert.equal(displayStatus(active), "ACTIVE");
  // An ACTIVE account that is not activated yet still shows as awaiting setup.
  assert.equal(displayStatus({ ...states("ACTIVE"), activatedAt: null }), "AWAITING_SETUP");
});

test("with accountStates: Archive replaces Delete; an archived account offers Restore only", () => {
  const opts = { accountStates: true, isMe: false, canArchive: true };
  assert.deepEqual(lifecycleActions(states("ACTIVE"), opts), ["suspend", "archive"]);
  assert.deepEqual(lifecycleActions(states("SUSPENDED"), opts), ["reactivate", "archive"]);
  assert.deepEqual(lifecycleActions(states("DEACTIVATED"), opts), ["reactivate", "archive"]);
  assert.deepEqual(lifecycleActions(states("ARCHIVED"), opts), ["restore"]);
  for (const s of ["ACTIVE", "SUSPENDED", "DEACTIVATED", "ARCHIVED"]) assert.ok(!lifecycleActions(states(s), opts).includes("delete"), s);
});

test("with accountStates but without users.archive: no Archive or Restore (and no Delete)", () => {
  const opts = { accountStates: true, isMe: false, canArchive: false };
  assert.deepEqual(lifecycleActions(states("ACTIVE"), opts), ["suspend"]);
  assert.deepEqual(lifecycleActions(states("ARCHIVED"), opts), []);
});

test("without accountStates (older backend): suspend / reactivate and delete exactly as before", () => {
  const opts = { accountStates: false, isMe: false, canArchive: true };
  assert.deepEqual(lifecycleActions(active, opts), ["suspend", "delete"]);
  assert.deepEqual(lifecycleActions({ ...active, isActive: false }, opts), ["reactivate", "delete"]);
});

test("backend not known yet (loading / UNKNOWN): suspend or reactivate only — never Delete or Archive", () => {
  const opts = { accountStates: null, isMe: false, canArchive: true };
  assert.deepEqual(lifecycleActions(active, opts), ["suspend"]);
  assert.deepEqual(lifecycleActions({ ...active, isActive: false }, opts), ["reactivate"]);
});

test("never any lifecycle action on your own account", () => {
  for (const accountStates of [true, false, null]) assert.deepEqual(lifecycleActions(states("ACTIVE"), { accountStates, isMe: true, canArchive: true }), []);
});

test("the reason rule matches the backend (3–500); stillBlockedBy in plain words", () => {
  assert.deepEqual(STATUS_REASON, { min: 3, max: 500 });
  assert.equal(stillBlockedText([]), null);
  assert.equal(stillBlockedText(undefined), null);
  assert.match(stillBlockedText(["NOT_ACTIVATED", "PENDING_APPROVAL"]), /^It still cannot sign in: .*activated.*; .*approval.*\.$/);
  assert.match(stillBlockedText(["SOMETHING_NEW"]), /something new/);
});
