// Registration and account management: the pure rules the forms rely on
// (backend develop 9fd1942 DTOs and role-assignment policy).
import { test } from "node:test";
import assert from "node:assert/strict";

import { countryLabel, schoolClaimPayload, validateSchoolClaim } from "../lib/accounts/school-claim.ts";
import { canPromoteToSuperAdmin, roleChangeNeedsPassword } from "../lib/auth/role-rules.ts";

test("school claim, directory: needs a chosen school with a 6-digit code; sends only schoolCode", () => {
  assert.ok(validateSchoolClaim({ mode: "directory", school: null }).school);
  assert.ok(validateSchoolClaim({ mode: "directory", school: { code: "12345", name: "X" } }).school, "5 digits refused");
  const d = { mode: "directory", school: { code: "123456", name: "Lycée de Kigali" } };
  assert.deepEqual(validateSchoolClaim(d), {});
  assert.deepEqual(schoolClaimPayload(d), { schoolCode: "123456" });
});

test("school claim, not listed: name 2–200 and all three places; sends name + province/district/sector", () => {
  const e = validateSchoolClaim({ mode: "notListed", name: " A ", province: "", district: "", sector: "" });
  assert.deepEqual(Object.keys(e).sort(), ["district", "province", "schoolName", "sector"]);
  const d = { mode: "notListed", name: "  New Hope School ", province: "Kigali City", district: "Gasabo", sector: "Remera" };
  assert.deepEqual(validateSchoolClaim(d), {});
  assert.deepEqual(schoolClaimPayload(d), { schoolName: "New Hope School", schoolProvince: "Kigali City", schoolDistrict: "Gasabo", schoolSector: "Remera" });
  assert.ok(validateSchoolClaim({ ...d, name: "x".repeat(201) }).schoolName);
});

test("school claim, abroad: two-letter country other than RW; sends country (uppercased) + name", () => {
  assert.ok(validateSchoolClaim({ mode: "abroad", country: "Kenya", name: "Alliance High" }).country);
  assert.match(validateSchoolClaim({ mode: "abroad", country: "rw", name: "Alliance High" }).country, /Rwanda/);
  const d = { mode: "abroad", country: "ke", name: " Alliance High " };
  assert.deepEqual(validateSchoolClaim(d), {});
  assert.deepEqual(schoolClaimPayload(d), { country: "KE", schoolName: "Alliance High" });
});

test("school claim payloads never mix shapes (the backend refuses mixed fields)", () => {
  const keys = (d) => Object.keys(schoolClaimPayload(d)).sort();
  assert.deepEqual(keys({ mode: "directory", school: { code: "123456", name: "S" } }), ["schoolCode"]);
  assert.deepEqual(keys({ mode: "notListed", name: "Abc", province: "P", district: "D", sector: "S" }), ["schoolDistrict", "schoolName", "schoolProvince", "schoolSector"]);
  assert.deepEqual(keys({ mode: "abroad", country: "UG", name: "Abc" }), ["country", "schoolName"]);
});

test("countryLabel: names a valid code where the runtime knows it, otherwise returns the code", () => {
  assert.match(countryLabel("ke"), /\(KE\)$/);
  assert.equal(countryLabel("K"), "K");
});

test("role change step-up: needed exactly when ADMIN or SUPER_ADMIN is on either side of a change", () => {
  assert.equal(roleChangeNeedsPassword("ADMIN", "MENTOR"), true);
  assert.equal(roleChangeNeedsPassword("STUDENT", "ADMIN"), true);
  assert.equal(roleChangeNeedsPassword("ADMIN", "SUPER_ADMIN"), true);
  assert.equal(roleChangeNeedsPassword("SUPER_ADMIN", "ADMIN"), true);
  assert.equal(roleChangeNeedsPassword("STUDENT", "MENTOR"), false);
  assert.equal(roleChangeNeedsPassword("TEACHER", "HEAD_COACH"), false);
  assert.equal(roleChangeNeedsPassword("ADMIN", "ADMIN"), false, "no change, no step-up");
  assert.equal(roleChangeNeedsPassword(undefined, "ADMIN"), false, "creation is not a role change");
});

test("promotion to Super Administrator: only by a Super Administrator, of an active, activated Administrator", () => {
  const admin = { role: "ADMIN", isActive: true, activatedAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(canPromoteToSuperAdmin("SUPER_ADMIN", admin), true);
  assert.equal(canPromoteToSuperAdmin("ADMIN", admin), false);
  assert.equal(canPromoteToSuperAdmin("SUPER_ADMIN", { ...admin, isActive: false }), false);
  assert.equal(canPromoteToSuperAdmin("SUPER_ADMIN", { ...admin, activatedAt: null }), false);
  assert.equal(canPromoteToSuperAdmin("SUPER_ADMIN", { ...admin, role: "MENTOR" }), false);
});
