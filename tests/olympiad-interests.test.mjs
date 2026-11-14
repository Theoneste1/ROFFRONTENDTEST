// Students' Olympiad interests (owner decision 8): capability gate, validation, order and labels
// (lib/accounts/olympiad-interests.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  INTERESTS_REQUIRED,
  OLYMPIAD_SUBJECTS,
  interestsText,
  normaliseInterests,
  sameInterests,
  studentInterestsSupported,
  toggleInterest,
  validateInterests,
} from "../lib/accounts/olympiad-interests.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("exactly Mathematics, Computing and Physics", () => {
  assert.deepEqual(OLYMPIAD_SUBJECTS.map((s) => [s.value, s.label]), [
    ["MATHEMATICS", "Mathematics"], ["COMPUTING", "Computing"], ["PHYSICS", "Physics"],
  ]);
});

test("shown and sent only on a backend advertising studentOlympiadInterests", () => {
  assert.ok(KNOWN_FEATURES.includes("studentOlympiadInterests"));
  assert.equal(studentInterestsSupported(NEW(["studentOlympiadInterests"])), true);
  assert.equal(studentInterestsSupported(NEW(["schoolAffiliations"])), false);
  assert.equal(studentInterestsSupported({ state: "LEGACY" }), false);
  assert.equal(studentInterestsSupported({ state: "UNKNOWN", reason: "network" }), false);
  assert.equal(studentInterestsSupported(undefined), false);
});

test("several at once; at least one required", () => {
  assert.equal(validateInterests([]), INTERESTS_REQUIRED);
  assert.equal(validateInterests(["PHYSICS"]), undefined);
  assert.equal(validateInterests(["MATHEMATICS", "COMPUTING", "PHYSICS"]), undefined);
  let v = toggleInterest([], "PHYSICS");
  v = toggleInterest(v, "MATHEMATICS");
  assert.deepEqual(v, ["MATHEMATICS", "PHYSICS"]);
  assert.deepEqual(toggleInterest(v, "PHYSICS"), ["MATHEMATICS"]);
});

test("normalise, compare and display", () => {
  assert.deepEqual(normaliseInterests(["PHYSICS", "CHEMISTRY", "MATHEMATICS", "PHYSICS"]), ["MATHEMATICS", "PHYSICS"]);
  assert.deepEqual(normaliseInterests(undefined), []);
  assert.equal(sameInterests(["PHYSICS", "COMPUTING"], ["COMPUTING", "PHYSICS"]), true);
  assert.equal(sameInterests(["PHYSICS"], []), false);
  assert.equal(sameInterests(undefined, []), true);
  assert.equal(interestsText(["MATHEMATICS", "COMPUTING"]), "Mathematics, Computing");
  assert.equal(interestsText([]), "");
  assert.equal(interestsText(null), "");
});
