// ACC-02: personal details on the administrators' user page (lib/accounts/admin-user-details.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ageOn, dateOfBirthText, personalDetailRows } from "../lib/accounts/admin-user-details.ts";

const TODAY = new Date("2026-11-18T10:00:00Z");

test("age and date text use the stored calendar date", () => {
  assert.equal(ageOn("2012-05-01T00:00:00.000Z", TODAY), 14);
  assert.equal(ageOn("2012-11-18", TODAY), 14);
  assert.equal(ageOn("2012-11-19", TODAY), 13);
  assert.equal(ageOn("nonsense", TODAY), null);
  assert.equal(dateOfBirthText("2012-05-01T00:00:00.000Z", TODAY), "1 May 2012 (14 years)");
});

test("a student's details, in order; guardian phone only for students; missing fields left out", () => {
  const student = { role: "STUDENT", dateOfBirth: "2012-05-01T00:00:00.000Z", phone: null, guardianPhone: "+250722000111", country: "RW", homeProvince: "Southern Province", homeDistrict: "Huye", homeSector: "Ngoma" };
  assert.deepEqual(personalDetailRows(student, TODAY), [
    { label: "Date of birth", value: "1 May 2012 (14 years)" },
    { label: "Phone", value: "—" },
    { label: "Close-family phone", value: "+250722000111" },
    { label: "Home country", value: personalDetailRows({ role: "X", country: "RW" })[0].value },
    { label: "Home place", value: "Ngoma, Huye, Southern Province" },
  ]);
  assert.deepEqual(personalDetailRows({ role: "MENTOR", phone: "+250788123456", guardianPhone: "+250700000000" }, TODAY), [{ label: "Phone", value: "+250788123456" }]);
  // Older backends send none of these fields: nothing extra is shown.
  assert.deepEqual(personalDetailRows({ role: "STUDENT" }, TODAY), []);
});
