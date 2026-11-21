// The standard school selection Country → Province → District → Sector → School
// (lib/schools/school-cascade.ts, lib/schools/countries.ts) and the order the claim is checked in.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  byName,
  districtsOf,
  emptyPlace,
  placeComplete,
  provincesOf,
  schoolFacts,
  sectorsOf,
  setPlaceLevel,
} from "../lib/schools/school-cascade.ts";
import { COUNTRY_CODES, countryName, countryOptions, isCountryCode, RWANDA } from "../lib/schools/countries.ts";
import { RWANDA as DIRECTORY_RWANDA, isCountryCode as directoryCountry } from "../lib/admin/school-directory.ts";
import { validateSchoolClaim, schoolClaimPayload } from "../lib/accounts/school-claim.ts";

const LOCATIONS = [
  { province: "Kigali City", districts: [{ district: "Gasabo", sectors: ["Remera", "Kacyiru"] }, { district: "Nyarugenge", sectors: ["Nyamirambo"] }] },
  { province: "Southern Province", districts: [{ district: "Huye", sectors: ["Ngoma", "Tumba"] }] },
];

test("each dropdown lists only what belongs to the step before it", () => {
  assert.deepEqual(provincesOf(LOCATIONS), ["Kigali City", "Southern Province"]);
  assert.deepEqual(districtsOf(LOCATIONS, "Kigali City"), ["Gasabo", "Nyarugenge"]);
  assert.deepEqual(districtsOf(LOCATIONS, "Southern Province"), ["Huye"]);
  assert.deepEqual(districtsOf(LOCATIONS, ""), []);
  assert.deepEqual(sectorsOf(LOCATIONS, "Kigali City", "Gasabo"), ["Remera", "Kacyiru"]);
  // A district of another province gives nothing.
  assert.deepEqual(sectorsOf(LOCATIONS, "Kigali City", "Huye"), []);
  assert.deepEqual(provincesOf(undefined), []);
});

test("changing a step clears every step after it", () => {
  const full = { province: "Kigali City", district: "Gasabo", sector: "Remera" };
  assert.deepEqual(setPlaceLevel(full, "province", "Southern Province"), { province: "Southern Province", district: "", sector: "" });
  assert.deepEqual(setPlaceLevel(full, "district", "Nyarugenge"), { province: "Kigali City", district: "Nyarugenge", sector: "" });
  assert.deepEqual(setPlaceLevel(full, "sector", "Kacyiru"), { ...full, sector: "Kacyiru" });
  // Choosing the same value again keeps the later steps.
  assert.equal(setPlaceLevel(full, "province", "Kigali City"), full);
  assert.deepEqual(setPlaceLevel(full, "province", ""), emptyPlace());
  assert.equal(placeComplete(full), true);
  assert.equal(placeComplete({ ...full, sector: "" }), false);
});

test("the chosen school's official information comes from its directory record", () => {
  const facts = schoolFacts({ name: "GS Remera", code: "110123", district: "Gasabo", sector: "Remera", location: "Remera, Gasabo" }, { province: "Kigali City" });
  assert.deepEqual(facts, [
    { label: "School", value: "GS Remera" },
    { label: "Official code", value: "110123" },
    { label: "Province", value: "Kigali City" },
    { label: "District", value: "Gasabo" },
    { label: "Sector", value: "Remera" },
  ]);
  const noCode = schoolFacts({ name: "Nairobi Academy", code: null, countryCode: "KE", location: "Nairobi" }, undefined, "Kenya");
  assert.deepEqual(noCode, [
    { label: "School", value: "Nairobi Academy" },
    { label: "Official code", value: "No official code" },
    { label: "Country", value: "Kenya" },
    { label: "Location", value: "Nairobi" },
  ]);
  assert.deepEqual(byName([{ name: "b" }, { name: "A" }, { name: "c" }]).map((s) => s.name), ["A", "b", "c"]);
});

test("countries: the backend's ISO list, Rwanda first, one definition of Rwanda", () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.ok(isCountryCode("KE") && isCountryCode("RW"));
  assert.ok(!isCountryCode("XK") && !isCountryCode("ke") && !isCountryCode("Kenya"));
  const opts = countryOptions();
  assert.equal(opts.length, 249);
  assert.deepEqual(opts[0], { value: "RW", label: countryName("RW") });
  const rest = opts.slice(1).map((o) => o.label);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, "en")));
  assert.equal(RWANDA, "RW");
  assert.equal(DIRECTORY_RWANDA, RWANDA);
  assert.equal(directoryCountry("KE"), true);
  assert.equal(directoryCountry("ZZ"), false);
});

test("school claim, Rwanda: checked in dropdown order; the school is sent by its official reference", () => {
  const start = { mode: "directory", ...emptyPlace(), school: null };
  assert.deepEqual(Object.keys(validateSchoolClaim(start)), ["province"]);
  assert.deepEqual(Object.keys(validateSchoolClaim({ ...start, province: "Kigali City" })), ["district"]);
  assert.deepEqual(Object.keys(validateSchoolClaim({ ...start, province: "Kigali City", district: "Gasabo" })), ["sector"]);
  const placed = { ...start, province: "Kigali City", district: "Gasabo", sector: "Remera" };
  assert.deepEqual(Object.keys(validateSchoolClaim(placed)), ["school"]);
  const coded = { ...placed, school: { id: "s1", code: "110123", name: "GS Remera" } };
  assert.deepEqual(validateSchoolClaim(coded), {});
  assert.deepEqual(schoolClaimPayload(coded), { schoolCode: "110123" });
  const uncoded = { ...placed, school: { id: "11111111-1111-4111-8111-111111111111", code: null, name: "New School" } };
  assert.deepEqual(schoolClaimPayload(uncoded), { schoolId: "11111111-1111-4111-8111-111111111111" });
});

test("school claim, another country: a country from the list (not Rwanda) and the school's name", () => {
  assert.equal(validateSchoolClaim({ mode: "abroad", country: "", name: "Alliance High" }).country, "Choose the country.");
  assert.equal(validateSchoolClaim({ mode: "abroad", country: "ZZ", name: "Alliance High" }).country, "Choose the country.");
  assert.match(validateSchoolClaim({ mode: "abroad", country: "RW", name: "Alliance High" }).country, /Rwanda/);
  assert.deepEqual(validateSchoolClaim({ mode: "abroad", country: "KE", name: "Alliance High" }), {});
});
