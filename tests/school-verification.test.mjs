// School verification (owner decision 2026-11-14): who may verify, and when Teachers may choose a school.
import { test } from "node:test";
import assert from "node:assert/strict";
import { schoolVerification } from "../lib/admin/school-directory.ts";

const school = (over = {}) => ({ isActive: true, countryCode: "RW", code: null, source: "ADMIN", lastVerifiedAt: null, lastVerifiedBy: null, ...over });

test("a school without an official code is open to Teachers only when an administrator created AND verified it", () => {
  assert.deepEqual(schoolVerification(school()), { verified: false, canVerify: true, teacherEligible: false });
  assert.deepEqual(schoolVerification(school({ lastVerifiedAt: "2026-11-14T10:00:00Z" })), { verified: true, canVerify: true, teacherEligible: true });
  // Free-text LEGACY schools: never, even if verified.
  assert.equal(schoolVerification(school({ source: "LEGACY", lastVerifiedAt: "2026-11-14T10:00:00Z" })).teacherEligible, false);
});

test("official-code schools are always open to Teachers; inactive or foreign schools are not, and cannot be verified", () => {
  assert.equal(schoolVerification(school({ code: "110104", source: "OFFICIAL_LIST" })).teacherEligible, true);
  assert.deepEqual(schoolVerification(school({ isActive: false, lastVerifiedAt: "x" })), { verified: true, canVerify: false, teacherEligible: false });
  assert.deepEqual(schoolVerification(school({ countryCode: "KE" })), { verified: false, canVerify: false, teacherEligible: false });
});
