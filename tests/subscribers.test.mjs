// News subscribers (lib/subscribers/rules.ts; capability `subscribers`, owner 2026-11-23): gating, the public box, the
// /unsubscribe link, the list filters in the address and the mailing composer's rules.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUBSCRIBERS_PERMISSION, audienceSummary, cleanAudience, filtersFromParams, filtersToQuery, interestsLabel, kindLabel,
  mailingCancellable, mailingProblems, newMailingKey, subscribeBody, subscribeProblems, subscribersNavVisible,
  subscribersPageMode, subscribersSupported, unsubscribeParams,
} from "../lib/subscribers/rules.ts";
import { ADMIN_SUBSCRIBERS, canSeeNavItem } from "../lib/auth/navigation.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["subscribers"] };
const WITHOUT = { state: "NEW", schemaVersion: 1, roles: [], features: ["countries"] };
const params = (q) => new URLSearchParams(q);
const can = (...held) => (p) => held.includes(p);

test("subscribers is a known feature; LEGACY, UNKNOWN and a NEW backend without it never enable it", () => {
  assert.ok(KNOWN_FEATURES.includes("subscribers"));
  assert.equal(subscribersSupported(HAS), true);
  for (const d of [WITHOUT, { state: "LEGACY" }, { state: "UNKNOWN" }, undefined, null]) assert.equal(subscribersSupported(d), false);
});

test("the menu item needs the feature AND the known subscribers.manage", () => {
  assert.equal(SUBSCRIBERS_PERMISSION, "subscribers.manage");
  assert.equal(ADMIN_SUBSCRIBERS.permission, "subscribers.manage");
  assert.equal(ADMIN_SUBSCRIBERS.href, "/admin/subscribers");
  assert.equal(subscribersNavVisible(HAS, new Set(["subscribers.manage"])), true);
  assert.equal(subscribersNavVisible(HAS, new Set(["users.manage"])), false);
  assert.equal(subscribersNavVisible(HAS, null), false);
  assert.equal(subscribersNavVisible(WITHOUT, new Set(["subscribers.manage"])), false);
  assert.equal(canSeeNavItem(ADMIN_SUBSCRIBERS, new Set(["subscribers.manage"])), true);
});

test("the screen waits, then needs the feature and the permission", () => {
  const base = { detection: HAS, detectionLoading: false, permissionsStatus: "ready", can: can("subscribers.manage") };
  assert.equal(subscribersPageMode(base), "visible");
  assert.equal(subscribersPageMode({ ...base, detectionLoading: true }), "loading");
  assert.equal(subscribersPageMode({ ...base, permissionsStatus: "loading" }), "loading");
  assert.equal(subscribersPageMode({ ...base, detection: WITHOUT }), "unsupported");
  assert.equal(subscribersPageMode({ ...base, permissionsStatus: "error" }), "error");
  assert.equal(subscribersPageMode({ ...base, can: can() }), "forbidden");
});

test("the public box: e-mail required and valid; name optional (2–100); plain words", () => {
  assert.deepEqual(subscribeProblems({ name: "", email: "ada@example.org", interests: [] }), {});
  assert.match(subscribeProblems({ name: "", email: "", interests: [] }).email, /Enter your e-mail address/);
  assert.match(subscribeProblems({ name: "", email: "ada@", interests: [] }).email, /valid e-mail address/);
  assert.match(subscribeProblems({ name: "A", email: "ada@example.org", interests: [] }).name, /2 to 100 characters/);
  assert.deepEqual(subscribeProblems({ name: "  ", email: " ada@example.org ", interests: [] }), {});
});

test("the request body: trimmed, name and interests only when given, the honeypot only when filled", () => {
  assert.deepEqual(subscribeBody({ name: " ", email: " ada@example.org ", interests: [] }), { email: "ada@example.org" });
  assert.deepEqual(subscribeBody({ name: " Ada ", email: "ada@example.org", interests: ["PHYSICS", "PHYSICS"] }, "bot"), {
    email: "ada@example.org", fullName: "Ada", interests: ["PHYSICS"], website: "bot",
  });
});

test("the unsubscribe link: s and t both needed", () => {
  assert.deepEqual(unsubscribeParams(params("s=abc&t=xyz")), { id: "abc", token: "xyz" });
  for (const q of ["", "s=abc", "t=xyz", "s=&t=x", `s=${"a".repeat(101)}&t=x`]) assert.equal(unsubscribeParams(params(q)), null, q);
});

test("list filters round-trip through the address; unknown values are ignored", () => {
  const f = filtersFromParams(params("q=%20grace%20&status=ACTIVE&interest=PHYSICS&kind=PARENT&source=IMPORT&country=rw&sort=name&page=3"));
  assert.deepEqual(f, { q: "grace", status: "ACTIVE", interest: "PHYSICS", kind: "PARENT", source: "IMPORT", country: "RW", sort: "name", page: 3 });
  assert.deepEqual(filtersFromParams(params(filtersToQuery(f))), f);
  assert.deepEqual(filtersFromParams(params("status=MAYBE&interest=CHEMISTRY&kind=X&source=Y&country=RWA&sort=random&page=-2")), {});
  assert.equal(filtersToQuery({ sort: "newest", page: 1, q: "" }), "");
});

test("labels: no interest = all subjects; no kind = a dash", () => {
  assert.equal(interestsLabel([]), "All subjects");
  assert.equal(interestsLabel(["MATHEMATICS", "COMPUTING"]), "Mathematics, Computing");
  assert.equal(kindLabel(null), "—");
  assert.equal(kindLabel("SCHOOL"), "School");
});

test("audience: only non-empty lists, valid country codes; summary in words", () => {
  assert.deepEqual(cleanAudience({ interests: [], kinds: [], countries: [] }), {});
  assert.deepEqual(cleanAudience({ interests: ["PHYSICS", "PHYSICS"], countries: ["rw", "xxx", " ke "] }), { interests: ["PHYSICS"], countries: ["RW", "KE"] });
  assert.equal(audienceSummary({}), "Everyone subscribed");
  assert.equal(audienceSummary({ interests: ["MATHEMATICS"], kinds: ["PARENT", "SCHOOL"], countries: ["RW"] }, (c) => (c === "RW" ? "Rwanda" : c)),
    "Subscribers interested in Mathematics (or every subject); who are parents or schools; in Rwanda");
});

test("the composer: subject 3–150, message 10–20,000; a fresh key each time; cancellable while waiting or sending", () => {
  assert.deepEqual(mailingProblems({ subject: "Olympiad 2027", body: "Registration opens on 1 February." }), {});
  assert.match(mailingProblems({ subject: "Hi", body: "Registration opens." }).subject, /3 to 150/);
  assert.match(mailingProblems({ subject: "Olympiad", body: "short" }).body, /at least 10/);
  assert.match(mailingProblems({ subject: "Olympiad", body: "x".repeat(20_001) }).body, /too long/);
  let n = 0;
  const keys = [newMailingKey(() => `k${++n}`), newMailingKey(() => `k${++n}`)];
  assert.deepEqual(keys, ["mailing-k1", "mailing-k2"]);
  assert.match(newMailingKey(), /^mailing-[0-9a-f-]{36}$/);
  assert.deepEqual(["QUEUED", "SENDING", "SENT", "FAILED", "CANCELLED"].map(mailingCancellable), [true, true, false, false, false]);
});
