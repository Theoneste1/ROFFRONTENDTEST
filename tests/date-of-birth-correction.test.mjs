// Administrator date-of-birth correction (lib/accounts/date-of-birth-correction.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCorrectDateOfBirth,
  CORRECTION_ERRORS,
  correctionBody,
  dateOfBirthProblem,
  historyActor,
  historyDate,
  historyLine,
  reasonProblem,
  validateCorrection,
} from "../lib/accounts/date-of-birth-correction.ts";

const TODAY = new Date(2026, 10, 18, 12);
const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });

test("offered only for a student, with the capability and users.manage", () => {
  const d = NEW(["dateOfBirthCorrection"]);
  assert.equal(canCorrectDateOfBirth(d, "STUDENT", true), true);
  assert.equal(canCorrectDateOfBirth(d, "TEACHER", true), false);
  assert.equal(canCorrectDateOfBirth(d, "STUDENT", false), false);
  assert.equal(canCorrectDateOfBirth(NEW([]), "STUDENT", true), false);
  assert.equal(canCorrectDateOfBirth(null, "STUDENT", true), false);
  assert.equal(canCorrectDateOfBirth({ state: "LEGACY" }, "STUDENT", true), false);
});

test("date of birth: a real past date, age 5–30", () => {
  assert.equal(dateOfBirthProblem("2012-05-01", TODAY), null);
  assert.equal(dateOfBirthProblem("2021-11-18", TODAY), null); // exactly 5
  assert.match(dateOfBirthProblem("2021-11-19", TODAY), /5 to 30/); // 4
  assert.equal(dateOfBirthProblem("1996-11-19", TODAY), null); // 29, turns 30 tomorrow
  assert.equal(dateOfBirthProblem("1995-11-19", TODAY), null); // 30
  assert.match(dateOfBirthProblem("1995-11-18", TODAY), /5 to 30/); // 31
  assert.match(dateOfBirthProblem("2027-01-01", TODAY), /future/);
  assert.match(dateOfBirthProblem("2012-02-30", TODAY), /real date/);
  assert.match(dateOfBirthProblem("01/05/2012", TODAY), /real date/);
  assert.match(dateOfBirthProblem("", TODAY), /Enter/);
});

test("reason: 5–500 characters after trimming", () => {
  assert.equal(reasonProblem("Birth certificate"), null);
  assert.match(reasonProblem("   abcd   "), /5–500/);
  assert.equal(reasonProblem("a".repeat(500)), null);
  assert.match(reasonProblem("a".repeat(501)), /5–500/);
});

test("validation by field and the request body", () => {
  assert.deepEqual(validateCorrection({ dateOfBirth: "2012-05-01", reason: "Birth certificate" }, TODAY), {});
  const e = validateCorrection({ dateOfBirth: "", reason: "x" }, TODAY);
  assert.ok(e.dateOfBirth && e.reason);
  assert.deepEqual(correctionBody({ dateOfBirth: "2012-05-01", reason: "  Birth certificate  " }), { dateOfBirth: "2012-05-01", reason: "Birth certificate" });
});

test("backend refusals have clear messages", () => {
  assert.equal(CORRECTION_ERRORS.DATE_OF_BIRTH_UNCHANGED, "That is already the recorded date of birth.");
  assert.ok(CORRECTION_ERRORS.NOT_A_STUDENT);
});

test("history: corrections show old → new, reason and who; first sign-in shows no values", () => {
  const corrected = {
    kind: "CORRECTED", at: "2026-11-18T09:00:00Z", from: "2012-05-01", to: "2012-06-02", reason: "Birth certificate",
    by: { id: "a1", username: "admin1", firstName: "Ada", lastName: "Mugisha" }, byRole: "ADMIN",
  };
  assert.deepEqual(historyLine(corrected), { title: "Corrected by an administrator", change: "1 May 2012 → 2 June 2012", reason: "Birth certificate" });
  assert.equal(historyActor(corrected, (r) => (r === "ADMIN" ? "Administrator" : r)), "Ada Mugisha @admin1 · Administrator");

  const firstFromNothing = { ...corrected, from: null };
  assert.equal(historyLine(firstFromNothing).change, "not recorded → 2 June 2012");

  const given = { kind: "GIVEN_AT_FIRST_SIGN_IN", at: "2026-11-01T09:00:00Z", by: { id: "s1", username: "kid", firstName: "Kim", lastName: "Uwase" }, byRole: "STUDENT" };
  assert.deepEqual(historyLine(given), { title: "Given by the student at first sign-in", change: null, reason: null });
});

test("history actor and dates degrade gracefully", () => {
  assert.equal(historyActor({ by: null, byRole: "ADMIN" }), "ADMIN");
  assert.equal(historyActor({ by: { id: "x" }, byRole: null }), "Unknown");
  assert.equal(historyActor({ by: null, byRole: null }), "Unknown");
  assert.equal(historyDate("2012-05-01"), "1 May 2012");
  assert.equal(historyDate(null), "not recorded");
});
