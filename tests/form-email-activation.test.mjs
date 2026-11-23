// E-mail activation per sign-up form (owner 2026-11-23): what the Forms page says and records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activationAction, activationSaved, activationSummary, formsErrorMessage, historyLines } from "../lib/admin/form-availability.ts";

test("only sign-up forms on a backend with the switch show it; off and on are said plainly", () => {
  assert.equal(activationSummary({}), null);                                      // contact form, or an older backend
  assert.match(activationSummary({ requireEmailVerification: false }), /^Not required: .*sign in at once/);
  assert.match(activationSummary({ requireEmailVerification: true }), /^Required: .*link in their e-mail/);
  assert.equal(activationAction(false), "Require e-mail activation");
  assert.equal(activationAction(true), "Stop requiring e-mail activation");
});

test("the confirmation after a change, and the history line", () => {
  assert.equal(activationSaved({ label: "Student registration", requireEmailVerification: true }), "Student registration: e-mail activation is now required for new sign-ups.");
  assert.match(activationSaved({ label: "Coach applications", requireEmailVerification: false }), /no longer required.*administrator/);
  assert.deepEqual(historyLines({ metadata: { changes: { requireEmailVerification: { from: false, to: true } } } }), ["E-mail activation: not required → required"]);
});

test("the contact form's refusal is explained", () => {
  assert.equal(formsErrorMessage({ status: 400, code: "NOT_A_SIGN_UP_FORM" }), "E-mail activation can be set only on the student, teacher and coach sign-up forms.");
});
