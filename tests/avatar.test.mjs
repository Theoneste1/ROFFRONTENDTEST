// The generated avatar and the profile picture rules (lib/accounts/avatar.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import { AVATAR_RULES, AVATAR_TONES, avatarFileProblem, avatarInitials, avatarLabel, avatarSource, avatarTone, displayName } from "../lib/accounts/avatar.ts";

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

test("tone: one of the ROF tones, the same for the same account every time", () => {
  const a = { id: "c5f32a97-5593-4fd6-b253-dd9ea75208d9", firstName: "Theoneste" };
  assert.ok(AVATAR_TONES.includes(avatarTone(a)));
  assert.equal(avatarTone(a), avatarTone({ ...a, firstName: "Renamed" }), "keyed by id, not by name");
  const seen = new Set(Array.from({ length: 40 }, (_, i) => avatarTone({ id: `user-${i}` })));
  assert.ok(seen.size >= 3, "accounts spread over the tones");
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
