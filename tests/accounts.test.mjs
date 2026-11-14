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
  // Once detection has failed, a retry in flight keeps the panel (and its "basic form" fallback).
  assert.deepEqual(registrationGate({ state: "UNKNOWN", reason: "timeout" }, true), { state: "failed", reason: "timeout", retrying: true }, "retry in flight");
  assert.deepEqual(registrationGate({ state: "UNKNOWN", reason: "timeout" }, false), { state: "failed", reason: "timeout", retrying: false });
  assert.deepEqual(registrationGate({ state: "LEGACY" }, false), { state: "ready", mode: "legacy" });
  assert.deepEqual(registrationGate(NEW(["schoolAffiliations"]), false), { state: "ready", mode: "directory" });
  assert.deepEqual(registrationGate(NEW([]), false), { state: "ready", mode: "legacy" });
});

// ─── Schools without an official code (owner decision 2026-11-14) ───────────

import { hasNoOfficialCode, SCHOOL_CLAIM_ERRORS, SCHOOL_CLAIM_SERVER_FIELDS } from "../lib/accounts/school-claim.ts";

const CODELESS_ID = "6f1d3c1e-2b1a-4c3d-9e8f-0a1b2c3d4e5f";

test("school claim, directory: a school without an official code is valid and sent by its id only (never a made-up code)", () => {
  const d = { mode: "directory", school: { id: CODELESS_ID, code: null, name: "Ecole Saint Gabriel", place: "Ngoma, Huye" } };
  assert.deepEqual(validateSchoolClaim(d), {});
  assert.deepEqual(schoolClaimPayload(d), { schoolId: CODELESS_ID });
  assert.ok(hasNoOfficialCode(d.school));
  // Without an id there is nothing to send.
  assert.ok(validateSchoolClaim({ mode: "directory", school: { code: null, name: "X" } }).school);
});

test("school claim, directory: a school WITH a code is still sent by its code (older backends keep working), even when its id is known", () => {
  const d = { mode: "directory", school: { id: CODELESS_ID, code: "220001", name: "GS Ngoma", place: "Ngoma, Huye" } };
  assert.deepEqual(validateSchoolClaim(d), {});
  assert.deepEqual(schoolClaimPayload(d), { schoolCode: "220001" });
  assert.equal(hasNoOfficialCode(d.school), false);
  // A malformed code is never replaced by the id.
  assert.ok(validateSchoolClaim({ mode: "directory", school: { id: CODELESS_ID, code: "12345", name: "X" } }).school);
});

test("pending claims: the same school by id (codeless) is a duplicate; a different id is not", () => {
  const current = { school: { id: CODELESS_ID, code: null } };
  assert.equal(sameClaimedSchool({ mode: "directory", school: { id: CODELESS_ID, code: null, name: "A" } }, current), true);
  assert.equal(sameClaimedSchool({ mode: "directory", school: { id: "11111111-2222-4333-8444-555555555555", code: null, name: "B" } }, current), false);
  assert.equal(sameClaimedSchool({ mode: "directory", school: { code: null, name: "A" } }, { school: { code: null } }), false, "two null codes are not the same school");
});

test("school claim errors: schoolId field errors and UNKNOWN_SCHOOL have a message", () => {
  assert.equal(SCHOOL_CLAIM_SERVER_FIELDS.schoolId, "school");
  assert.match(SCHOOL_CLAIM_ERRORS.UNKNOWN_SCHOOL, /list/);
});
