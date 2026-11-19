// Countries (lib/countries/reference.ts; owner decision 2026-11-19, capability `countries`): every form always lists every
// country (the reference list, or the built-in list without the capability), the Countries screen gating, and the
// correction form's rules (same as the backend's UpdateCountryDto).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REFERENCE_MANAGE_PERMISSION,
  countriesNavVisible,
  countriesPageMode,
  countriesSupported,
  countryChange,
  countryChoices,
  countryDisplayName,
  countryEditProblems,
  filterCountries,
  referenceCountryOptions,
} from "../lib/countries/reference.ts";
import { ADMIN_COUNTRIES, canSeeNavItem } from "../lib/auth/navigation.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";
import { COUNTRY_CODES, countryOptions } from "../lib/schools/countries.ts";

const HAS = { state: "NEW", schemaVersion: 1, roles: [], features: ["countries"] };
const NEW_WITHOUT = { state: "NEW", schemaVersion: 1, roles: [], features: ["formAvailability"] };
const can = (...held) => (p) => held.includes(p);

test("countries is a known feature; LEGACY and a NEW backend without it never enable it", () => {
  assert.ok(KNOWN_FEATURES.includes("countries"));
  assert.equal(countriesSupported(HAS), true);
  for (const d of [NEW_WITHOUT, { state: "LEGACY" }, undefined, null]) assert.equal(countriesSupported(d), false);
});

test("without the capability, or before the list loads, the built-in ISO list is offered exactly as before", () => {
  assert.deepEqual(countryChoices(false, [{ code: "RW", name: "Rwanda" }]), countryOptions());
  assert.deepEqual(countryChoices(true, undefined), countryOptions());
  assert.deepEqual(countryChoices(true, []), countryOptions());
});

test("the reference list: every country it sends, Rwanda first then by name, with the corrected names", () => {
  const all = COUNTRY_CODES.map((code) => ({ code, name: code === "KE" ? "Republic of Kenya" : `Country ${code}` }));
  const options = countryChoices(true, all);
  assert.equal(options.length, COUNTRY_CODES.length);           // nothing filtered out: no country is ever blocked
  assert.deepEqual(options[0], { value: "RW", label: "Country RW" });
  assert.ok(options.some((o) => o.value === "KE" && o.label === "Republic of Kenya"));
  assert.deepEqual(referenceCountryOptions([{ code: "UG", name: "Uganda" }, { code: "RW", name: "Rwanda" }, { code: "KE", name: "Kenya" }]), [
    { value: "RW", label: "Rwanda" }, { value: "KE", label: "Kenya" }, { value: "UG", label: "Uganda" },
  ]);
  assert.equal(countryDisplayName("KE", all), "Republic of Kenya");
  assert.equal(countryDisplayName("RW"), "Rwanda");   // the browser's name without a list
});

test("Countries screen and menu: the capability AND reference.manage", () => {
  const base = { detection: HAS, detectionLoading: false, permissionsStatus: "ready" };
  assert.equal(countriesPageMode({ ...base, can: can(REFERENCE_MANAGE_PERMISSION) }), "visible");
  assert.equal(countriesPageMode({ ...base, can: can() }), "forbidden");
  assert.equal(countriesPageMode({ ...base, detection: NEW_WITHOUT, can: can(REFERENCE_MANAGE_PERMISSION) }), "unsupported");
  assert.equal(countriesPageMode({ ...base, detectionLoading: true, can: can() }), "loading");
  assert.equal(countriesPageMode({ ...base, permissionsStatus: "error", can: can() }), "error");
  assert.equal(countriesNavVisible(HAS, new Set(["reference.manage"])), true);
  assert.equal(countriesNavVisible(HAS, new Set(["forms.view"])), false);
  assert.equal(countriesNavVisible(NEW_WITHOUT, new Set(["reference.manage"])), false);
  assert.equal(countriesNavVisible(HAS, null), false);
  assert.equal(ADMIN_COUNTRIES.href, "/admin/countries");
  assert.equal(canSeeNavItem(ADMIN_COUNTRIES, new Set(["reference.manage"])), true);
  assert.equal(canSeeNavItem(ADMIN_COUNTRIES, new Set(["users.manage"])), false);
});

test("search by part of the name or the exact code", () => {
  const rows = [{ code: "RW", name: "Rwanda" }, { code: "KE", name: "Kenya" }, { code: "NO", name: "Norway" }];
  assert.deepEqual(filterCountries(rows, "").map((c) => c.code), ["RW", "KE", "NO"]);
  assert.deepEqual(filterCountries(rows, "rw").map((c) => c.code), ["RW", "NO"]);
  assert.deepEqual(filterCountries(rows, " ke ").map((c) => c.code), ["KE"]);
});

test("correction form: the backend's rules, and only what changed is sent (an empty calling code removes it)", () => {
  assert.deepEqual(countryEditProblems({ name: "Kenya", phonePrefix: "+254" }), {});
  assert.deepEqual(countryEditProblems({ name: "Kenya", phonePrefix: "" }), {});
  assert.ok(countryEditProblems({ name: "K", phonePrefix: "" }).name);
  assert.ok(countryEditProblems({ name: "Kenya", phonePrefix: "254" }).phonePrefix);
  assert.ok(countryEditProblems({ name: "Kenya", phonePrefix: "+12345" }).phonePrefix);
  const before = { name: "Kenya", phonePrefix: "+254" };
  assert.deepEqual(countryChange(before, { name: " Kenya ", phonePrefix: "+254" }), {});
  assert.deepEqual(countryChange(before, { name: "Republic of Kenya", phonePrefix: "+254" }), { name: "Republic of Kenya" });
  assert.deepEqual(countryChange(before, { name: "Kenya", phonePrefix: " " }), { phonePrefix: null });
  assert.deepEqual(countryChange({ name: "Antarctica", phonePrefix: null }, { name: "Antarctica", phonePrefix: "+672" }), { phonePrefix: "+672" });
});
