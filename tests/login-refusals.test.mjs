// Sign-in refusals after a correct password (lib/auth/login-refusals.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { accountRefusalMessage } from "../lib/auth/login-refusals.ts";

test("deactivated and archived accounts get their own clear message", () => {
  assert.match(accountRefusalMessage("ACCOUNT_DEACTIVATED"), /deactivated/);
  assert.match(accountRefusalMessage("ACCOUNT_DEACTIVATED"), /Contact ROF support/);
  assert.match(accountRefusalMessage("ACCOUNT_ARCHIVED"), /archived/);
  assert.match(accountRefusalMessage("ACCOUNT_ARCHIVED"), /Contact ROF support/);
  assert.notEqual(accountRefusalMessage("ACCOUNT_DEACTIVATED"), accountRefusalMessage("ACCOUNT_ARCHIVED"));
});

test("the existing suspended and pending-approval messages are unchanged", () => {
  assert.equal(accountRefusalMessage("ACCOUNT_SUSPENDED"), "Your account is suspended. Contact ROF support if you think this is a mistake.");
  assert.equal(accountRefusalMessage("ACCOUNT_PENDING_APPROVAL"), "Your account is waiting for an administrator's approval. You'll receive an e-mail once it is approved.");
});

test("any other code is not an account refusal (the form shows the generic error)", () => {
  for (const c of ["INVALID_CREDENTIALS", "ACCOUNT_NOT_ACTIVATED", "", null, undefined, "toString", "__proto__"]) assert.equal(accountRefusalMessage(c), null, String(c));
});
