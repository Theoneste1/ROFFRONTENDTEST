// Coach application details (lib/accounts/coach-application.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COACH_SUBJECTS_LABEL,
  COACH_SUBJECTS_REQUIRED,
  coachDetailsPayload,
  coachDetailsSupported,
  coachInterestsSupported,
  coachSubjectsText,
  validateCoachSubjects,
  coachDetailsText,
  EDUCATION_LEVELS,
  educationLabel,
  emptyCoachDetails,
  validateCoachDetails,
} from "../lib/accounts/coach-application.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
const filled = (over = {}) => ({ ...emptyCoachDetails(), country: "KE", occupation: " Engineer ", educationLevel: "BACHELOR", interests: ["MATHEMATICS", "PHYSICS"], ...over });

test("capability gate", () => {
  assert.equal(coachDetailsSupported(NEW(["coachApplicationDetails"])), true);
  assert.equal(coachDetailsSupported(NEW([])), false);
  assert.equal(coachDetailsSupported({ state: "LEGACY" }), false);
});

test("education levels are the backend's enum", () => {
  assert.deepEqual(EDUCATION_LEVELS.map((l) => l.value), ["SECONDARY", "DIPLOMA", "BACHELOR", "MASTER", "DOCTORATE", "OTHER"]);
  assert.equal(educationLabel("MASTER"), "Master's degree");
});

test("an empty draft names every field; a complete one passes", () => {
  const e = validateCoachDetails({ ...emptyCoachDetails(), country: "" });
  assert.deepEqual(Object.keys(e).sort(), ["country", "educationLevel", "occupation", "olympiadInterests"]);
  assert.deepEqual(validateCoachDetails(filled()), {});
  assert.ok(validateCoachDetails(filled({ occupation: "x" })).occupation);
  assert.ok(validateCoachDetails(filled({ occupation: "x".repeat(201) })).occupation);
  assert.ok(validateCoachDetails(filled({ educationLevel: "PHD" })).educationLevel);
  assert.ok(validateCoachDetails(filled({ interests: [] })).olympiadInterests);
});

test("payload: several interests, trimmed occupation, no ID fields", () => {
  const p = coachDetailsPayload(filled());
  assert.deepEqual(p, { country: "KE", occupation: "Engineer", educationLevel: "BACHELOR", olympiadInterests: ["MATHEMATICS", "PHYSICS"] });
  for (const k of ["passport", "nationalId", "idNumber"]) assert.ok(!(k in p));
});

test("administrators' summary line", () => {
  assert.equal(coachDetailsText({ country: "KE", occupation: "Engineer", educationLevel: "BACHELOR", olympiadInterests: ["MATHEMATICS", "COMPUTING"] }), "Kenya · Engineer · Bachelor's degree · Mathematics, Computing");
  assert.equal(coachDetailsText({}), "");
});

// Coaches' subjects (owner decision 2026-11-19, capability coachOlympiadInterests).
test("subjects: the question, its capability gate and its rule (at least one), shared by registration, profile and admin", () => {
  assert.equal(COACH_SUBJECTS_LABEL, "Which subjects are you interested in coaching?");
  assert.equal(coachInterestsSupported(NEW(["coachOlympiadInterests"])), true);
  assert.equal(coachInterestsSupported(NEW(["coachApplicationDetails"])), false);
  assert.equal(coachInterestsSupported({ state: "LEGACY" }), false);
  assert.equal(validateCoachSubjects([]), "Please choose at least one subject");
  assert.equal(COACH_SUBJECTS_REQUIRED, "Please choose at least one subject");
  for (const ok of [["MATHEMATICS"], ["MATHEMATICS", "PHYSICS"], ["MATHEMATICS", "COMPUTING", "PHYSICS"]]) assert.equal(validateCoachSubjects(ok), undefined);
  // The coach application uses the same rule and message; the rest of its rules are unchanged.
  assert.equal(validateCoachDetails(filled({ interests: [] })).olympiadInterests, "Please choose at least one subject");
  assert.deepEqual(Object.keys(validateCoachDetails(filled({ interests: [] }))), ["olympiadInterests"]);
});

test("subjects: shown as stored (the backend keeps the fixed order), or 'Not set' for a coach without any (never filled in)", () => {
  assert.equal(coachSubjectsText(["PHYSICS", "MATHEMATICS"]), "Physics, Mathematics");
  assert.equal(coachSubjectsText(["MATHEMATICS", "COMPUTING", "PHYSICS"]), "Mathematics, Computing, Physics");
  assert.equal(coachSubjectsText([]), "Not set");
  assert.equal(coachSubjectsText(null), "Not set");
  assert.equal(coachSubjectsText(undefined), "Not set");
});
