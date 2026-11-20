// Home location (capability homeLocationRules; owner, 2026-11-20): the rules shared by the Student, Teacher and Coach
// forms and the profile (lib/accounts/home-location), the teacher form's own draft rules, and the searchable list.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  chooseHomeCountry,
  emptyHome,
  followSchoolCountry,
  homeFromProfile,
  homeLocationRulesSupported,
  homePlacePayload,
  schoolCountryOfClaim,
  setHomeLevel,
  validateHome,
} from "../lib/accounts/home-location.ts";
import { buildTeacherPayload, emptyTeacherDraft, setHomeCountry, setHomeProvince, validateTeacherRegistration } from "../lib/accounts/teacher-registration.ts";
import { filterOptions } from "../app/components/ui/SearchableSelect.tsx";
import { COACH_PARTS, STUDENT_PARTS, TEACHER_PARTS } from "../lib/forms/registration-fields.ts";

const PLACE = { province: "Kigali City", district: "Gasabo", sector: "Remera" };
const ids = (parts) => parts.map((p) => p.id);

test("asked only on a backend advertising homeLocationRules", () => {
  assert.equal(homeLocationRulesSupported({ state: "NEW", schemaVersion: 1, roles: [], features: ["homeLocationRules"] }), true);
  assert.equal(homeLocationRulesSupported({ state: "NEW", schemaVersion: 1, roles: [], features: [] }), false);
  assert.equal(homeLocationRulesSupported(null), false);
});

test("3. / 5. the home country follows the school country until the person chooses one", () => {
  let h = emptyHome("RW");
  h = followSchoolCountry(h, "UG");
  assert.equal(h.country, "UG");
  h = followSchoolCountry(h, "KE");
  assert.equal(h.country, "KE");
  h = followSchoolCountry(h, "");            // a school abroad without its country yet: unchanged
  assert.equal(h.country, "KE");
  // The school country of a claim: Rwanda for a listed or not-listed Rwandan school, the chosen country abroad.
  assert.equal(schoolCountryOfClaim({ mode: "directory", school: null }), "RW");
  assert.equal(schoolCountryOfClaim({ mode: "notListed", name: "", province: "", district: "", sector: "" }), "RW");
  assert.equal(schoolCountryOfClaim({ mode: "abroad", country: "UG", name: "" }), "UG");
});

test("4. a manually chosen home country is never overwritten by the school country", () => {
  let h = chooseHomeCountry(emptyHome("RW"), "BI");
  assert.equal(h.countryChosen, true);
  h = followSchoolCountry(h, "UG");
  assert.equal(h.country, "BI");
  // Choosing the same country explicitly also counts as a choice.
  const same = chooseHomeCountry(emptyHome("RW"), "RW");
  assert.equal(followSchoolCountry(same, "UG").country, "RW");
});

test("6. / 7. leaving Rwanda clears the place; coming back asks for it again", () => {
  let h = { ...emptyHome("RW"), place: PLACE };
  h = chooseHomeCountry(h, "UG");
  assert.deepEqual(h.place, { province: "", district: "", sector: "" });
  assert.deepEqual(validateHome(h), {});
  assert.deepEqual(homePlacePayload(h), {});
  h = chooseHomeCountry(h, "RW");
  assert.deepEqual(validateHome(h), {
    homeProvince: "Choose your home province.", homeDistrict: "Choose your home district.", homeSector: "Choose your home sector.",
  });
  // The school country moving to another country clears it too (when not chosen).
  const followed = followSchoolCountry({ ...emptyHome("RW"), place: PLACE }, "KE");
  assert.deepEqual(followed.place, { province: "", district: "", sector: "" });
});

test("8. a new province resets district and sector; a new district resets the sector", () => {
  let h = { ...emptyHome("RW"), place: PLACE };
  h = setHomeLevel(h, "district", "Kicukiro");
  assert.deepEqual(h.place, { province: "Kigali City", district: "Kicukiro", sector: "" });
  h = setHomeLevel({ ...h, place: PLACE }, "province", "Southern Province");
  assert.deepEqual(h.place, { province: "Southern Province", district: "", sector: "" });
});

test("1. / 2. validation and payload: Rwanda needs all three; another country only the country; no country is an error", () => {
  assert.deepEqual(validateHome(emptyHome("")), { homeCountry: "Choose your home country." });
  const rw = { ...emptyHome("RW"), place: PLACE };
  assert.deepEqual(validateHome(rw), {});
  assert.deepEqual(homePlacePayload(rw), { homeProvince: "Kigali City", homeDistrict: "Gasabo", homeSector: "Remera" });
  assert.deepEqual(validateHome(emptyHome("UG")), {});
});

test("9. profile: a stored Rwandan or international home becomes a draft (the stored country counts as chosen)", () => {
  assert.deepEqual(homeFromProfile({ country: "RW", homeProvince: "Kigali City", homeDistrict: "Gasabo", homeSector: "Remera" }),
    { country: "RW", place: PLACE, countryChosen: true });
  assert.deepEqual(homeFromProfile({ country: "UG", homeProvince: null }), { country: "UG", place: { province: "", district: "", sector: "" }, countryChosen: true });
  assert.deepEqual(homeFromProfile({}), { country: "", place: { province: "", district: "", sector: "" }, countryChosen: false });
});

test("teacher: home country Rwanda by default; with the rules the place is asked only for Rwanda; older backends as before", () => {
  const d = { ...emptyTeacherDraft(), homeProvince: "Kigali City", homeDistrict: "Gasabo", homeSector: "Remera" };
  assert.equal(emptyTeacherDraft().country, "RW");
  const abroad = setHomeCountry(d, "UG");
  assert.deepEqual([abroad.homeProvince, abroad.homeDistrict, abroad.homeSector], ["", "", ""]);
  const e = validateTeacherRegistration(abroad, true);
  assert.equal(e.homeProvince ?? e.homeDistrict ?? e.homeSector, undefined);
  const rwanda = validateTeacherRegistration({ ...emptyTeacherDraft() }, true);
  assert.ok(rwanda.homeProvince && rwanda.homeDistrict && rwanda.homeSector);
  const older = validateTeacherRegistration({ ...emptyTeacherDraft() }, false);
  assert.equal(older.homeProvince, undefined);
  assert.ok(older.homeDistrict && older.homeSector);
  assert.deepEqual(setHomeProvince(d, "Southern Province"), { ...d, homeProvince: "Southern Province", homeDistrict: "", homeSector: "" });
  const listed = { ...d, school: { id: "s1", name: "S", code: "1", sector: "x", district: "y" } };
  const pay = buildTeacherPayload(listed, true);
  assert.deepEqual([pay.homeProvince, pay.homeDistrict, pay.homeSector], ["Kigali City", "Gasabo", "Remera"]);
  const payAbroad = buildTeacherPayload({ ...setHomeCountry(listed, "UG") }, true);
  assert.equal("homeProvince" in payAbroad || "homeDistrict" in payAbroad || "homeSector" in payAbroad, false);
  assert.equal("homeProvince" in buildTeacherPayload(listed, false), false);
});

test("the home location sits together, in order, on every form: country, province, district, sector", () => {
  for (const [parts, country] of [[STUDENT_PARTS, "homeCountry"], [TEACHER_PARTS, "country"], [COACH_PARTS, "country"]]) {
    const i = ids(parts).indexOf(country);
    assert.deepEqual(ids(parts).slice(i, i + 4), [country, "homeProvince", "homeDistrict", "homeSector"]);
  }
});

test("the searchable list: names starting with the text first, then containing it; accents and case ignored", () => {
  const options = [
    { value: "CI", label: "Côte d'Ivoire" }, { value: "RW", label: "Rwanda" }, { value: "UG", label: "Uganda" }, { value: "AD", label: "Andorra" },
  ];
  assert.deepEqual(filterOptions(options, "").map((o) => o.value), ["CI", "RW", "UG", "AD"]);
  assert.deepEqual(filterOptions(options, "cote").map((o) => o.value), ["CI"]);
  assert.deepEqual(filterOptions(options, "AN").map((o) => o.value), ["AD", "RW", "UG"]);
  assert.deepEqual(filterOptions(options, "rw").map((o) => o.value), ["RW"]);
  assert.deepEqual(filterOptions(options, "zz"), []);
});
