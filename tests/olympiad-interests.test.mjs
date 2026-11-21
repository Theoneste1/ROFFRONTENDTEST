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

// ─── "Other" Olympiad interest (owner, 2026-11-21; capability olympiadInterestOther) ───────────────────────────────
import {
  OTHER_INTEREST_PROBLEM,
  interestsWithOtherText,
  otherInterestField,
  otherInterestSupported,
  validateInterestsWithOther,
} from "../lib/accounts/olympiad-interests.ts";

test("Other: offered only on backends with olympiadInterestOther", () => {
  assert.equal(otherInterestSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["olympiadInterestOther"] }), true);
  assert.equal(otherInterestSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["studentOlympiadInterests"] }), false);
  assert.equal(otherInterestSupported(null), false);
});

test("Other: alone counts; ticked needs 2–100 characters; unticked needs a subject (with the form's message)", () => {
  assert.equal(validateInterestsWithOther([], "Chemistry"), undefined);
  assert.equal(validateInterestsWithOther(["PHYSICS"], " Biology "), undefined);
  assert.equal(validateInterestsWithOther(["PHYSICS"], null), undefined);
  assert.equal(validateInterestsWithOther([], ""), OTHER_INTEREST_PROBLEM);
  assert.equal(validateInterestsWithOther(["MATHEMATICS"], " C "), OTHER_INTEREST_PROBLEM, "ticked but too short, even beside a subject");
  assert.equal(validateInterestsWithOther([], "x".repeat(101)), OTHER_INTEREST_PROBLEM);
  assert.match(validateInterestsWithOther([], null), /Choose at least one Olympiad/);
  assert.equal(validateInterestsWithOther([], null, "Please choose at least one subject"), "Please choose at least one subject");
});

test("Other: the request field — trimmed text; null only to clear a stored one; nothing otherwise", () => {
  assert.deepEqual(otherInterestField("  Chemistry "), { olympiadInterestOther: "Chemistry" });
  assert.deepEqual(otherInterestField(null), {});
  assert.deepEqual(otherInterestField(null, "Chemistry"), { olympiadInterestOther: null });
  assert.deepEqual(otherInterestField("Biology", "Chemistry"), { olympiadInterestOther: "Biology" });
  assert.deepEqual(otherInterestField("", null), {});
});

test("Other: shown after the subjects", () => {
  assert.equal(interestsWithOtherText(["MATHEMATICS", "PHYSICS"], "Chemistry"), "Mathematics, Physics, Other: Chemistry");
  assert.equal(interestsWithOtherText([], "Chemistry"), "Other: Chemistry");
  assert.equal(interestsWithOtherText(["COMPUTING"], null), "Computing");
  assert.equal(interestsWithOtherText([], null), "");
});
