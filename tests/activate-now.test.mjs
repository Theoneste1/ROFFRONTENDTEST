// Activate now (owner 2026-11-24): when the account page offers it, its confirmation and success texts, the bulk action
// (gated on adminActivateNow and users.changeStatus), the preview's count and the item codes in plain words.
import { test } from "node:test";
import assert from "node:assert/strict";

import { activateNowConfirmText, activateNowDoneText, activateNowVisible } from "../lib/accounts/activate-now.ts";
import { BULK_ACTIONS, allowedActions, itemCodeLabel, willApplySummary } from "../lib/admin/bulk-users.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const awaiting = { activatedAt: null, isActive: true, hasPassword: true, accountStatus: "ACTIVE" };
const ctx = { featureOn: true, canChangeStatus: true, isMe: false };
const can = (...held) => (p) => held.includes(p);

test("adminActivateNow is a known feature", () => {
  assert.ok(KNOWN_FEATURES.includes("adminActivateNow"));
});

test("the button: an active account awaiting setup whose person chose a password, for an administrator with users.changeStatus", () => {
  assert.equal(activateNowVisible(awaiting, ctx), true);
  assert.equal(activateNowVisible({ ...awaiting, accountStatus: undefined }, ctx), true, "older list shape without accountStatus");
  // Never without the backend feature or the permission, nor on one's own account.
  assert.equal(activateNowVisible(awaiting, { ...ctx, featureOn: false }), false);
  assert.equal(activateNowVisible(awaiting, { ...ctx, canChangeStatus: false }), false);
  assert.equal(activateNowVisible(awaiting, { ...ctx, isMe: true }), false);
  // Already activated; invited without a password (or a backend that does not say); not active.
  assert.equal(activateNowVisible({ ...awaiting, activatedAt: "2026-11-24T08:00:00Z" }, ctx), false);
  assert.equal(activateNowVisible({ ...awaiting, hasPassword: false }, ctx), false);
  assert.equal(activateNowVisible({ ...awaiting, hasPassword: undefined }, ctx), false);
  assert.equal(activateNowVisible({ ...awaiting, isActive: false, accountStatus: "SUSPENDED" }, ctx), false);
  assert.equal(activateNowVisible({ ...awaiting, accountStatus: "DEACTIVATED" }, ctx), false);
});

test("confirmation and success texts in plain words", () => {
  assert.match(activateNowConfirmText("Aline Uwase"), /^Aline Uwase will be able to sign in at once, without confirming their e-mail\./);
  assert.equal(activateNowDoneText("Aline Uwase", []), "Aline Uwase's account is active. They can sign in now.");
  assert.equal(activateNowDoneText("Aline Uwase", undefined), "Aline Uwase's account is active. They can sign in now.");
  assert.match(activateNowDoneText("Jean Bosco", ["PENDING_APPROVAL"]), /activated, but the account still waits for approval/);
});

test("bulk: 'Activate now (skip e-mail confirmation)' only with adminActivateNow and users.changeStatus", () => {
  assert.equal(BULK_ACTIONS.activateNow.label, "Activate now (skip e-mail confirmation)");
  assert.ok(!allowedActions(can("users.changeStatus")).includes("activateNow"));
  assert.ok(!allowedActions(can(), false, false, true).includes("activateNow"));
  const all = allowedActions(can("users.changeStatus", "users.suspend"), false, false, true);
  assert.ok(all.includes("activateNow"));
  assert.equal(all.indexOf("activateNow"), all.indexOf("activate") + 1, "right after Activate");
});

test("bulk preview: how many will be activated, how many are skipped", () => {
  assert.equal(willApplySummary({ action: "activateNow", total: 5, willApply: 3 }), "3 accounts will be activated now; 2 are skipped (the reasons are below).");
  assert.equal(willApplySummary({ action: "activateNow", total: 1, willApply: 1 }), "1 account will be activated now.");
  assert.equal(willApplySummary({ action: "activateNow", total: 2, willApply: 1 }), "1 account will be activated now; 1 is skipped (the reasons are below).");
  assert.equal(willApplySummary({ action: "activate", total: 4 }), null, "no count from the server: nothing is claimed");
});

test("bulk item codes for activateNow in plain words", () => {
  assert.equal(itemCodeLabel("ALREADY_ACTIVATED"), "Already active: can sign in");
  assert.equal(itemCodeLabel("NO_PASSWORD_YET"), "No password yet: resend the invitation");
  assert.equal(itemCodeLabel("ACCOUNT_NOT_ACTIVE"), "Not active: reactivate, lift or restore it first");
  assert.equal(itemCodeLabel("ROLE_NOT_MANAGEABLE"), "You cannot manage this role");
});
