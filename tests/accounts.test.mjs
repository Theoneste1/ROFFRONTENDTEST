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

// ── Follow-up: backend-dependent step-up, pending claims, registration gate ──
import { roleChangeStepUp } from "../lib/auth/role-rules.ts";
import { sameClaimedSchool } from "../lib/accounts/school-claim.ts";
import { registrationGate } from "../lib/accounts/registration-mode.ts";

test("role-change step-up is asked and sent only on a NEW backend (LEGACY refuses currentPassword)", () => {
  for (const [from, to] of [["STUDENT", "ADMIN"], ["MENTOR", "ADMIN"], ["ADMIN", "MENTOR"], ["ADMIN", "STUDENT"], ["ADMIN", "SUPER_ADMIN"]]) {
    assert.equal(roleChangeStepUp("NEW", from, to), true, `NEW ${from}→${to}`);
    assert.equal(roleChangeStepUp("LEGACY", from, to), false, `LEGACY ${from}→${to}`);
    assert.equal(roleChangeStepUp("UNKNOWN", from, to), false, `UNKNOWN ${from}→${to}: asked only if the backend demands it`);
    assert.equal(roleChangeStepUp(undefined, from, to), false, `loading ${from}→${to}`);
  }
  assert.equal(roleChangeStepUp("NEW", "STUDENT", "MENTOR"), false, "no admin role involved");
});

test("pending claims: only the same official school (same code) is treated as a duplicate", () => {
  const current = { school: { code: "110101" } };
  assert.equal(sameClaimedSchool({ mode: "directory", school: { code: "110101", name: "A" } }, current), true);
  assert.equal(sameClaimedSchool({ mode: "directory", school: { code: "220202", name: "B" } }, current), false);
  assert.equal(sameClaimedSchool({ mode: "notListed", name: "A", province: "P", district: "D", sector: "S" }, current), false, "left to the backend");
  assert.equal(sameClaimedSchool({ mode: "directory", school: { code: "110101", name: "A" } }, { school: null }), false);
});

test("registration gate: no form until detection answers; UNKNOWN is a visible failure, never LEGACY", () => {
  const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
  assert.deepEqual(registrationGate(undefined, true), { state: "loading" });
  assert.deepEqual(registrationGate(undefined, false), { state: "loading" });
  assert.deepEqual(registrationGate({ state: "UNKNOWN", reason: "timeout" }, true), { state: "loading" }, "retry in flight");
  assert.deepEqual(registrationGate({ state: "UNKNOWN", reason: "timeout" }, false), { state: "failed", reason: "timeout" });
  assert.deepEqual(registrationGate({ state: "LEGACY" }, false), { state: "ready", mode: "legacy" });
  assert.deepEqual(registrationGate(NEW(["schoolAffiliations"]), false), { state: "ready", mode: "directory" });
  assert.deepEqual(registrationGate(NEW([]), false), { state: "ready", mode: "legacy" });
});
