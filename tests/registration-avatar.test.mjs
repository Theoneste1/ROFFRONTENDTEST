// REG-02 (agreed: optional, never mandatory) — lib/accounts/registration-avatar.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pictureOutcomeText, registrationAvatarProblem, registrationAvatarSupported, uploadRegistrationAvatar } from "../lib/accounts/registration-avatar.ts";

test("offered only by backends with registrationAvatar", () => {
  assert.equal(registrationAvatarSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["registrationAvatar"] }), true);
  assert.equal(registrationAvatarSupported({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), false);
  assert.equal(registrationAvatarSupported({ state: "LEGACY" }), false);
});

test("no picture is never a problem; a wrong type or a too large file is", () => {
  assert.equal(registrationAvatarProblem(null), null);
  assert.equal(registrationAvatarProblem({ name: "me.png", type: "image/png", size: 1000 }), null);
  assert.ok(registrationAvatarProblem({ name: "me.gif", type: "image/gif", size: 1000 }));
  assert.ok(registrationAvatarProblem({ name: "me.png", type: "image/png", size: 3 * 1024 * 1024 }));
});

test("upload: nothing chosen → nothing sent; no token → reported, never thrown", async () => {
  assert.deepEqual(await uploadRegistrationAvatar("tok", null), { outcome: "none" });
  const r = await uploadRegistrationAvatar(undefined, { name: "me.png", type: "image/png", size: 10 });
  assert.equal(r.outcome, "failed");
  assert.match(r.message, /later in My Profile/);
});

test("confirmation text", () => {
  assert.equal(pictureOutcomeText(null), null);
  assert.equal(pictureOutcomeText({ outcome: "none" }), null);
  assert.equal(pictureOutcomeText({ outcome: "saved" }), "Your profile picture was added.");
  assert.match(pictureOutcomeText({ outcome: "failed", message: "x" }), /^x$/);
});
