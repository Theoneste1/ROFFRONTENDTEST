// QA 2026-11-24: an Administrator's form marks the field another account already uses (409 IDENTITY_TAKEN with
// details.fields); public sign-up answers never say which, and then nothing is marked.
import { test } from "node:test";
import assert from "node:assert/strict";

const { ApiError } = await import("../lib/api/errors.ts");
const { TAKEN_FIELD_TEXT, takenFields } = await import("../lib/accounts/identity-taken.ts");

test("details.fields → the fields to mark, each with a plain sentence", () => {
  assert.deepEqual(takenFields(new ApiError(409, "IDENTITY_TAKEN", "x", { fields: ["username"] })), ["username"]);
  assert.deepEqual(takenFields(new ApiError(409, "IDENTITY_TAKEN", "x", { fields: ["username", "email"] })), ["username", "email"]);
  assert.match(TAKEN_FIELD_TEXT.username, /^This username is already used by another account\. Choose a different username\.$/);
  assert.match(TAKEN_FIELD_TEXT.email, /already used by another account/);
});

test("no fields (public sign-up, Head Coach invitation, an older backend) or another error → nothing marked", () => {
  assert.deepEqual(takenFields(new ApiError(409, "IDENTITY_TAKEN", "Username or email is already in use.")), []);
  assert.deepEqual(takenFields(new ApiError(409, "IDENTITY_TAKEN", "x", { fields: ["password", 3] })), []);
  assert.deepEqual(takenFields(new ApiError(400, "VALIDATION_FAILED", "x", { fields: ["username"] })), []);
  assert.deepEqual(takenFields(new Error("x")), []);
});
