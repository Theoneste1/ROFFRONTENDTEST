// The generated avatar and the profile picture rules (lib/accounts/avatar.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { avatarRetry, avatarUploadErrorText, AVATAR_RULES, AVATAR_TONES, avatarFileProblem, avatarInitials, avatarLabel, avatarSource, avatarTone, displayName } from "../lib/accounts/avatar.ts";

test("label: first name and last-name initial (\"Theoneste N\")", () => {
  assert.equal(avatarLabel({ firstName: "Theoneste", lastName: "Nsanzabarinda" }), "Theoneste N");
  assert.equal(avatarInitials({ firstName: "Theoneste", lastName: "Nsanzabarinda" }), "TN");
  assert.equal(displayName({ firstName: "Theoneste", lastName: "Nsanzabarinda" }), "Theoneste Nsanzabarinda");
});

test("label: odd whitespace and casing are tidied; mixed case is kept", () => {
  assert.equal(avatarLabel({ firstName: "  THEONESTE ", lastName: " nsanzabarinda  " }), "Theoneste N");
  assert.equal(avatarLabel({ firstName: "jean   paul", lastName: "mugisha" }), "Jean Paul M");
  assert.equal(avatarLabel({ firstName: "McKenzie", lastName: "de la Cruz" }), "McKenzie D");
  assert.equal(avatarLabel({ firstName: "Élise", lastName: "Ûmutoni" }), "Élise Û");
  assert.equal(avatarInitials({ firstName: "élise", lastName: "ûmutoni" }), "ÉÛ");
});

test("label: missing names fall back to the username, then to \"User\"", () => {
  assert.equal(avatarLabel({ firstName: "Aline", lastName: "" }), "Aline");
  assert.equal(avatarLabel({ firstName: "", lastName: "Uwase" }), "Uwase");
  assert.equal(avatarLabel({ firstName: " ", lastName: null, username: "student.s2" }), "student.s2");
  assert.equal(avatarLabel({}), "User");
  assert.equal(avatarLabel(null), "User");
  assert.equal(avatarInitials({ username: "student.s2" }), "ST");
  assert.equal(avatarInitials({ username: "..." }), "U");
  assert.equal(avatarInitials(undefined), "U");
  assert.equal(displayName({ username: "rca.coach" }), "rca.coach");
});

test("tone: every account without a picture has the same logo-blue avatar with white initials (owner 2026-11-25)", () => {
  assert.deepEqual([...AVATAR_TONES], ["bg-brand text-white"]);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => avatarTone({ id: `user-${i}`, firstName: `N${i}` })));
  assert.deepEqual([...seen], ["bg-brand text-white"]);
  assert.equal(avatarTone(null), "bg-brand text-white");
});

test("picture file: JPEG, PNG or WebP up to 2 MB", () => {
  const f = (name, type, size) => ({ name, type, size });
  assert.equal(avatarFileProblem(f("me.jpg", "image/jpeg", 1000)), null);
  assert.equal(avatarFileProblem(f("me.png", "image/png", AVATAR_RULES.maxBytes)), null);
  assert.equal(avatarFileProblem(f("me.webp", "", 1000)), null, "no type reported: judged by the extension");
  assert.match(avatarFileProblem(f("me.gif", "image/gif", 1000)), /JPEG, PNG or WebP/);
  assert.match(avatarFileProblem(f("doc.pdf", "application/pdf", 1000)), /JPEG, PNG or WebP/);
  assert.match(avatarFileProblem(f("big.jpg", "image/jpeg", AVATAR_RULES.maxBytes + 1)), /2 MB/);
  assert.match(avatarFileProblem(f("empty.png", "image/png", 0)), /empty/);
  assert.match(avatarFileProblem(null), /Choose/);
});

test("picture source: API paths go through the authenticated client; only https URLs are used directly", () => {
  assert.deepEqual(avatarSource("/api/v1/users/u1/avatar?v=f1"), { kind: "api", path: "/users/u1/avatar?v=f1" });
  assert.deepEqual(avatarSource("https://cdn.example.org/a.png"), { kind: "url", url: "https://cdn.example.org/a.png" });
  assert.equal(avatarSource("http://insecure.example.org/a.png"), null);
  assert.equal(avatarSource("javascript:alert(1)"), null);
  assert.equal(avatarSource(""), null);
  assert.equal(avatarSource(null), null);
});

test("upload refusals from the backend get clear messages (415, 413, 400 codes)", () => {
  assert.equal(avatarUploadErrorText({ status: 415, code: "FILE_TYPE_NOT_ALLOWED" }), "Use a JPEG, PNG or WEBP image.");
  assert.equal(avatarUploadErrorText({ status: 413, code: "PAYLOAD_TOO_LARGE" }), "The picture must be 2 MB or smaller.");
  assert.equal(avatarUploadErrorText({ status: 413 }), "The picture must be 2 MB or smaller.");
  assert.equal(avatarUploadErrorText({ status: 400, code: "FILE_REQUIRED" }), "Choose a picture.");
  assert.equal(avatarUploadErrorText({ status: 400, code: "EMPTY_FILE" }), "That file is empty.");
  assert.equal(avatarUploadErrorText({ status: 500, code: "INTERNAL_ERROR" }), null);
  assert.equal(avatarUploadErrorText(null), null);
});

test("a refused picture is final (the generated avatar is shown): 404 — also another viewer of a student's picture — 401, 403; a server error is retried once", () => {
  for (const status of [404, 401, 403]) assert.equal(avatarRetry(0, { status }), false, String(status));
  assert.equal(avatarRetry(0, { status: 500 }), true);
  assert.equal(avatarRetry(1, { status: 500 }), false);
  assert.equal(avatarRetry(0, new Error("network")), true);   // no status: a network failure
  assert.equal(avatarRetry(0, { status: 0 }), true);          // the client's network-error status
});
