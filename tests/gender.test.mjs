// Gender at sign-up (capability registrationGender; owner, 2026-11-20): required on the student, teacher and coach
// forms, FEMALE or MALE; asked and sent only when the backend advertises the feature.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GENDER_OPTIONS, genderSupported, validateGender } from "../lib/accounts/gender.ts";
import { COACH_PARTS, STUDENT_PARTS, TEACHER_PARTS } from "../lib/forms/registration-fields.ts";
import GenderField from "../app/components/account/GenderField.tsx";

const detection = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("the choices are exactly Female and Male, the values the backend accepts", () => {
  assert.deepEqual(GENDER_OPTIONS.map((o) => [o.value, o.label]), [["FEMALE", "Female"], ["MALE", "Male"]]);
});

test("required: nothing chosen or an unknown value is an error; FEMALE and MALE are valid", () => {
  for (const v of ["", "OTHER", "female"]) assert.equal(validateGender(v), "Choose your gender.");
  for (const v of ["FEMALE", "MALE"]) assert.equal(validateGender(v), undefined);
});

test("asked only on a backend advertising registrationGender", () => {
  assert.equal(genderSupported(null), false);
  assert.equal(genderSupported(detection(["studentRegistrationDetails"])), false);
  assert.equal(genderSupported(detection(["registrationGender"])), true);
});

test("every sign-up form has the gender field, right after the names", () => {
  for (const parts of [STUDENT_PARTS, TEACHER_PARTS, COACH_PARTS]) {
    assert.deepEqual(parts.slice(0, 3).map((p) => p.id), ["firstName", "lastName", "gender"]);
    assert.deepEqual(parts[2].fields, ["gender"]);
  }
});

test("the field: two radio choices named gender, marked required, the error shown", () => {
  const html = renderToStaticMarkup(createElement(GenderField, { value: "", onChange: () => {}, error: "Choose your gender." }));
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2);
  assert.match(html, /name="gender" value="FEMALE"/);
  assert.match(html, /name="gender" value="MALE"/);
  // The required marker is in the design system's amber (Academic Prestige: required asterisks in #D97706).
  assert.match(html, /Gender <span class="text-amber-600">\*<\/span>/);
  assert.match(html, /Choose your gender\./);
  const chosen = renderToStaticMarkup(createElement(GenderField, { value: "MALE", onChange: () => {} }));
  assert.match(chosen, /name="gender" checked="" value="MALE"/);
});

test("the gender step: students, teachers and coaches whose profile says genderRequired; never administrators or older backends", async () => {
  const { needsGender } = await import("../lib/accounts/gender.ts");
  for (const role of ["STUDENT", "TEACHER", "MENTOR"]) assert.equal(needsGender({ role, genderRequired: true }), true);
  assert.equal(needsGender({ role: "ADMIN", genderRequired: true }), false);
  assert.equal(needsGender({ role: "STUDENT", genderRequired: false }), false);
  assert.equal(needsGender({ role: "STUDENT" }), false);   // older backend: no flag
  assert.equal(needsGender(null), false);
});
