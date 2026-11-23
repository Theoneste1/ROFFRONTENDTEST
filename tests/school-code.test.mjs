// A school without a code at registration (lib/schools/school-code.ts, school-claim.ts, teacher-registration.ts; owner 2026-11-23).
import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanSchoolCode, isNewSchoolCodeError, schoolCodeProblem } from "../lib/schools/school-code.ts";
import { needsSchoolCode, schoolClaimPayload, validateSchoolClaim } from "../lib/accounts/school-claim.ts";
import { buildTeacherPayload, emptyTeacherDraft, validateTeacherRegistration } from "../lib/accounts/teacher-registration.ts";

test("the code: required, 6 digits, the province's first digit — in plain words", () => {
  assert.match(schoolCodeProblem("", "Southern Province"), /no code in our list yet: enter its 6-digit school code/);
  assert.equal(schoolCodeProblem("2207", "Southern Province"), "A school code is exactly 6 digits.");
  assert.equal(schoolCodeProblem("120077", "Southern Province"), "A school code in Southern Province starts with 2. Check the code with the school.");
  assert.equal(schoolCodeProblem("220 077", "Southern Province"), undefined);
  assert.equal(schoolCodeProblem("520077", null), undefined);
  assert.equal(cleanSchoolCode(" 220 077 "), "220077");
});

test("the backend's answers about the code are recognised by their field", () => {
  assert.equal(isNewSchoolCodeError({ code: "SCHOOL_CODE_TAKEN", details: { field: "newSchoolCode" } }), true);
  assert.equal(isNewSchoolCodeError({ code: "INVALID_SCHOOL_CODE", details: { field: "proposedSchoolCode" } }), false);
  assert.equal(isNewSchoolCodeError({ code: "UNKNOWN_SCHOOL" }), false);
});

const codeless = { mode: "directory", province: "Southern Province", district: "Huye", sector: "Ngoma", school: { id: "s1", code: null, name: "Ecole Saint Michel" } };
const coded = { ...codeless, school: { id: "s2", code: "220001", name: "GS Ngoma" } };

test("student registration: a school without a code asks for it (only with the backend feature); sent with the school id", () => {
  const on = { askCodeForCodeless: true };
  assert.equal(needsSchoolCode(codeless, on), true);
  assert.equal(needsSchoolCode(codeless, {}), false);
  assert.equal(needsSchoolCode(coded, on), false);
  assert.match(validateSchoolClaim(codeless, on).newSchoolCode, /6-digit school code/);
  assert.deepEqual(validateSchoolClaim(codeless, {}), {});
  assert.deepEqual(validateSchoolClaim({ ...codeless, newCode: "120077" }, on), { newSchoolCode: "A school code in Southern Province starts with 2. Check the code with the school." });
  assert.deepEqual(validateSchoolClaim({ ...codeless, newCode: "220 077" }, on), {});
  assert.deepEqual(schoolClaimPayload({ ...codeless, newCode: "220 077" }, on), { schoolId: "s1", newSchoolCode: "220077" });
  assert.deepEqual(schoolClaimPayload({ ...codeless, newCode: "220077" }, {}), { schoolId: "s1" });
  assert.deepEqual(schoolClaimPayload(coded, on), { schoolCode: "220001" });
});

test("teacher application: a listed school without a code asks for it; sent with the school id", () => {
  const d = { ...emptyTeacherDraft(), schoolProvince: "Southern Province", schoolDistrict: "Huye", schoolSector: "Ngoma", schoolMode: "listed",
    school: { id: "s1", name: "Ecole Saint Michel", code: null, sector: "Ngoma", district: "Huye" } };
  assert.match(validateTeacherRegistration(d, false, false, true).newSchoolCode, /6-digit school code/);
  assert.equal(validateTeacherRegistration(d, false, false, false).newSchoolCode, undefined);
  assert.equal(validateTeacherRegistration({ ...d, newSchoolCode: "220077" }, false, false, true).newSchoolCode, undefined);
  const payload = buildTeacherPayload({ ...d, newSchoolCode: "220 077" }, false, false, true);
  assert.equal(payload.schoolId, "s1");
  assert.equal(payload.newSchoolCode, "220077");
  assert.equal("newSchoolCode" in buildTeacherPayload({ ...d, school: { ...d.school, code: "220001" }, newSchoolCode: "x" }, false, false, true), false);
});
