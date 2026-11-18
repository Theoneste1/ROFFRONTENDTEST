// First-sign-in date of birth (owner decision 9.3): lib/accounts/date-of-birth-step.ts and dateOfBirthProblem.
import { test } from "node:test";
import assert from "node:assert/strict";

import { needsDateOfBirth } from "../lib/accounts/date-of-birth-step.ts";
import { dateOfBirthProblem, validateStudentDetails, emptyStudentDetails } from "../lib/accounts/student-details.ts";

const TODAY = new Date(2026, 10, 18); // 18 Nov 2026

test("only a student the backend flags is held at the step", () => {
  assert.equal(needsDateOfBirth({ role: "STUDENT", dateOfBirthRequired: true }), true);
  assert.equal(needsDateOfBirth({ role: "STUDENT", dateOfBirthRequired: false }), false);
  // Older backends never send the flag: nobody is held.
  assert.equal(needsDateOfBirth({ role: "STUDENT" }), false);
  for (const role of ["TEACHER", "MENTOR", "HEAD_COACH", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(needsDateOfBirth({ role, dateOfBirthRequired: true }), false, role);
  }
  assert.equal(needsDateOfBirth(null), false);
  assert.equal(needsDateOfBirth(undefined), false);
});

test("the date of birth follows the registration rules (real past date, age 5–30)", () => {
  assert.equal(dateOfBirthProblem("2012-05-01", TODAY), null);
  assert.equal(dateOfBirthProblem("", TODAY), "Enter your date of birth.");
  for (const bad of ["2012-02-30", "01/05/2012", "2099-01-01"]) assert.equal(dateOfBirthProblem(bad, TODAY), "Enter a valid date of birth.", bad);
  for (const outOfRange of ["2023-01-01", "1990-01-01"]) assert.match(dateOfBirthProblem(outOfRange, TODAY), /5 to 30 years old/, outOfRange);
});

test("the sign-up form uses the same rule", () => {
  const d = { ...emptyStudentDetails(), dateOfBirth: "2023-01-01" };
  assert.equal(validateStudentDetails(d, TODAY).dateOfBirth, dateOfBirthProblem("2023-01-01", TODAY));
});
