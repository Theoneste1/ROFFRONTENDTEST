// Student sign-up details (lib/accounts/student-details.ts): date of birth, phones, home country and home place.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ageOn,
  birthDateBounds,
  emptyStudentDetails,
  homePlaceText,
  setHomeCountry,
  setHomeLevel,
  studentDetailsPayload,
  studentDetailsSupported,
  STUDENT_DETAILS_ERRORS,
  validateStudentDetails,
} from "../lib/accounts/student-details.ts";
import { normalisePhone } from "../lib/accounts/phone.ts";
import { normalisePhone as teacherNormalise } from "../lib/accounts/teacher-registration.ts";

const TODAY = new Date(2026, 10, 15); // 15 Nov 2026
const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
const filled = (over = {}) => ({
  ...emptyStudentDetails(),
  dateOfBirth: "2012-03-04",
  guardianPhone: "0788 123 456",
  home: { province: "Kigali City", district: "Nyarugenge", sector: "Gitega" },
  ...over,
});

test("capability gate", () => {
  assert.equal(studentDetailsSupported(NEW(["studentRegistrationDetails"])), true);
  assert.equal(studentDetailsSupported(NEW(["studentOlympiadInterests"])), false);
  assert.equal(studentDetailsSupported({ state: "LEGACY" }), false);
  assert.equal(studentDetailsSupported(null), false);
});

test("age in full years; invalid and future dates refused", () => {
  assert.equal(ageOn("2012-11-15", TODAY), 14, "birthday today");
  assert.equal(ageOn("2012-11-16", TODAY), 13, "birthday tomorrow");
  assert.equal(ageOn("2026-11-15", TODAY), 0);
  assert.equal(ageOn("2026-11-16", TODAY), null, "future");
  assert.equal(ageOn("2012-02-30", TODAY), null, "not a date");
  assert.equal(ageOn("15/11/2012", TODAY), null, "format");
  const b = birthDateBounds(TODAY);
  assert.equal(b.max, "2021-11-15");
  assert.equal(ageOn(b.max, TODAY), 5);
  assert.equal(ageOn(b.min, TODAY), 30);
});

test("a complete Rwandan draft passes; the payload sends the official home place, not free text", () => {
  assert.deepEqual(validateStudentDetails(filled(), TODAY), {});
  assert.deepEqual(studentDetailsPayload(filled()), {
    dateOfBirth: "2012-03-04",
    guardianPhone: "+250788123456",
    homeCountry: "RW",
    homeProvince: "Kigali City",
    homeDistrict: "Nyarugenge",
    homeSector: "Gitega",
  });
});

test("student phone is optional; when given it is checked and normalised", () => {
  assert.equal(validateStudentDetails(filled({ phone: "  " }), TODAY).phone, undefined);
  assert.ok(validateStudentDetails(filled({ phone: "12" }), TODAY).phone);
  assert.equal(studentDetailsPayload(filled({ phone: "0722 000 111" })).phone, "+250722000111");
  assert.ok(!("phone" in studentDetailsPayload(filled({ phone: "" }))));
});

test("close-family phone is required and checked", () => {
  assert.match(validateStudentDetails(filled({ guardianPhone: "" }), TODAY).guardianPhone, /parent or close family/);
  assert.match(validateStudentDetails(filled({ guardianPhone: "0788" }), TODAY).guardianPhone, /valid phone/);
  assert.equal(validateStudentDetails(filled({ guardianPhone: "+254 712 345 678" }), TODAY).guardianPhone, undefined);
});

test("date of birth: required, valid, 5–30 years", () => {
  assert.ok(validateStudentDetails(filled({ dateOfBirth: "" }), TODAY).dateOfBirth);
  assert.ok(validateStudentDetails(filled({ dateOfBirth: "2024-01-01" }), TODAY).dateOfBirth, "too young");
  assert.ok(validateStudentDetails(filled({ dateOfBirth: "1990-01-01" }), TODAY).dateOfBirth, "too old");
  assert.ok(validateStudentDetails(filled({ dateOfBirth: "2030-01-01" }), TODAY).dateOfBirth, "future");
});

test("home place in Rwanda: checked in dropdown order; changing a level clears the later ones", () => {
  const start = { ...filled(), home: { province: "", district: "", sector: "" } };
  assert.deepEqual(Object.keys(validateStudentDetails(start, TODAY)), ["homeProvince"]);
  let d = setHomeLevel(start, "province", "Kigali City");
  assert.deepEqual(Object.keys(validateStudentDetails(d, TODAY)), ["homeDistrict"]);
  d = setHomeLevel(d, "district", "Gasabo");
  assert.deepEqual(Object.keys(validateStudentDetails(d, TODAY)), ["homeSector"]);
  d = setHomeLevel(d, "sector", "Remera");
  assert.deepEqual(validateStudentDetails(d, TODAY), {});
  assert.deepEqual(setHomeLevel(d, "province", "Southern Province").home, { province: "Southern Province", district: "", sector: "" });
  assert.deepEqual(setHomeLevel(d, "district", "Kicukiro").home, { province: "Kigali City", district: "Kicukiro", sector: "" });
});

test("another home country: free-text city or region, no Rwandan fields; changing the country clears the home", () => {
  const ke = setHomeCountry(filled(), "KE");
  assert.deepEqual(ke.home, { province: "", district: "", sector: "" });
  assert.equal(ke.homeLocation, "");
  assert.ok(validateStudentDetails(ke, TODAY).homeLocation);
  const ok = { ...ke, homeLocation: " Nairobi " };
  assert.deepEqual(validateStudentDetails(ok, TODAY), {});
  const p = studentDetailsPayload(ok);
  assert.equal(p.homeLocation, "Nairobi");
  assert.equal(p.homeCountry, "KE");
  for (const k of ["homeProvince", "homeDistrict", "homeSector"]) assert.ok(!(k in p), k);
  assert.ok(validateStudentDetails({ ...ok, homeCountry: "ZZ" }, TODAY).homeCountry);
  assert.equal(setHomeCountry(ok, "KE"), ok, "same country: unchanged");
});

test("server codes land on the home fields", () => {
  assert.equal(STUDENT_DETAILS_ERRORS.UNKNOWN_HOME_LOCATION.field, "homeSector");
  assert.equal(STUDENT_DETAILS_ERRORS.HOME_LOCATION_RWANDA_ONLY.field, "homeCountry");
});

test("profile home text; one shared phone rule for students and teachers", () => {
  assert.equal(homePlaceText({ homeProvince: "Kigali City", homeDistrict: "Nyarugenge", homeSector: "Gitega" }), "Gitega, Nyarugenge, Kigali City");
  assert.equal(homePlaceText({ homeProvince: null, homeDistrict: null, homeSector: null }), "");
  assert.equal(normalisePhone, teacherNormalise);
});
