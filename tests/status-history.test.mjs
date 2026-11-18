// Account history (lib/accounts/status-history.ts): labels, who made the change, and when the card is shown.
import { test } from "node:test";
import assert from "node:assert/strict";

import { changedBy, statusHistoryVisible, statusLabel, transitionText } from "../lib/accounts/status-history.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["accountStates"] };
const can = (...held) => (p) => held.includes(p);
const actor = { id: "a", username: "amina", firstName: "Amina", lastName: "K" };

test("labels and transitions", () => {
  assert.equal(statusLabel("ARCHIVED"), "Archived");
  assert.equal(statusLabel("SOMETHING"), "SOMETHING");
  assert.equal(statusLabel(null), "—");
  assert.equal(transitionText({ fromStatus: "SUSPENDED", toStatus: "ACTIVE" }), "Suspended → Active");
  assert.equal(transitionText({ fromStatus: null, toStatus: "SUSPENDED" }), "Suspended");
});

test("who changed it: a person, a bulk operation, a deleted account, or the system", () => {
  assert.equal(changedBy({ actor, actorRole: "ADMIN", operationId: null }), "Amina K (@amina)");
  assert.equal(changedBy({ actor, actorRole: "ADMIN", operationId: "op1" }), "Amina K (@amina), bulk operation");
  assert.equal(changedBy({ actor: null, actorRole: "SUPER_ADMIN", operationId: null }), "a deleted super admin account");
  assert.equal(changedBy({ actor: null, actorRole: null, operationId: null }), "system");
});

test("shown only with accountStates and users.viewStatusHistory", () => {
  assert.equal(statusHistoryVisible(HAS, can("users.viewStatusHistory")), true);
  assert.equal(statusHistoryVisible(HAS, can()), false);
  assert.equal(statusHistoryVisible({ ...HAS, features: [] }, can("users.viewStatusHistory")), false);
  assert.equal(statusHistoryVisible({ state: "LEGACY" }, can("users.viewStatusHistory")), false);
});
