// Banking information (owner 2026-11-25): the frontend's copy of the rules (lib/accounts/banking.ts) answers like the
// backend's (src/banking/banking-rules.ts), which decides. The step shows for Teachers, Coaches and Head Coaches only.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BANKS, confirmReplaceMessage, conflictsOf, initialValues, needsBanking, rulesFor, submissionOf, TEACHER_NUMBER_MESSAGE, UMWALIMU_SACCO, validateBanking,
} from "../lib/accounts/banking.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const teacher = {
  personalAccountName: "Jean Uwase", personalBankName: UMWALIMU_SACCO, personalAccountNumber: "123456789012",
  schoolAccountName: "GS Kigali", schoolBankName: UMWALIMU_SACCO, schoolAccountNumber: "4001234567",
};
const coach = { ...teacher, personalBankName: "Bank of Kigali Plc", personalAccountNumber: "00012345678" };

test("the step shows for Teachers, Coaches and Head Coaches whose details are incomplete; never for other roles", () => {
  for (const role of ["TEACHER", "MENTOR", "HEAD_COACH"]) {
    assert.equal(needsBanking({ role, bankingRequired: true }), true);
    assert.equal(needsBanking({ role, bankingRequired: false }), false);
    assert.equal(needsBanking({ role }), false, "an older backend: never");
  }
  for (const role of ["STUDENT", "ADMIN", "SUPER_ADMIN"]) assert.equal(needsBanking({ role, bankingRequired: true }), false);
  assert.ok(KNOWN_FEATURES.includes("bankingDetails"));
});

test("the owner's twelve banks; teachers: Umwalimu SACCO only, 12 digits", () => {
  assert.equal(BANKS.length, 12);
  assert.ok(BANKS.includes("Zigama Credit and Savings Bank"), "the agreed name");
  assert.ok(!BANKS.some((b) => b.includes("Zigama CSS")));
  assert.deepEqual(rulesFor("TEACHER"), { personalBank: "FIXED", schoolBank: "FIXED", fixedBank: UMWALIMU_SACCO, banks: [UMWALIMU_SACCO], personalNumberDigits: 12 });
  assert.equal(rulesFor("MENTOR").personalBank, "LIST");
  assert.deepEqual(rulesFor("HEAD_COACH"), rulesFor("MENTOR"));
});

test("teacher: a valid 12-digit number passes; 11, 13, letters or symbols get the exact message", () => {
  assert.deepEqual(validateBanking(rulesFor("TEACHER"), teacher), {});
  for (const n of ["12345678901", "1234567890123", "12345678901A", "1234 5678 9012", "123456-789012", ""]) {
    assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, personalAccountNumber: n }), { personalAccountNumber: TEACHER_NUMBER_MESSAGE }, n);
  }
});

test("coach and head coach: a bank from the list; an arbitrary bank refused; the 12-digit rule does not apply", () => {
  for (const role of ["MENTOR", "HEAD_COACH"]) {
    assert.deepEqual(validateBanking(rulesFor(role), coach), {});
    assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalBankName: "My Own Bank" }), { personalBankName: "Choose your bank from the list." });
    assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalBankName: "" }), { personalBankName: "Bank name is required." });
    assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalAccountNumber: "123456" }), {});
  }
});

test("every missing field is named; saved values are kept, the fixed banks filled in; the submission sends Umwalimu SACCO", () => {
  const empty = initialValues({ rules: rulesFor("MENTOR"), details: null });
  assert.deepEqual(Object.keys(validateBanking(rulesFor("MENTOR"), empty)).sort(),
    ["personalAccountName", "personalAccountNumber", "personalBankName", "schoolAccountName", "schoolAccountNumber"]);
  const kept = initialValues({ rules: rulesFor("MENTOR"), details: { personalAccountName: "Partial Person", personalBankName: "Ecobank Rwanda Plc" } });
  assert.equal(kept.personalAccountName, "Partial Person");
  assert.equal(kept.personalBankName, "Ecobank Rwanda Plc");
  assert.equal(kept.schoolBankName, UMWALIMU_SACCO);
  // A teacher's saved other bank is shown as replaced on submit (never silently by the system).
  const t = initialValues({ rules: rulesFor("TEACHER"), details: { personalBankName: "Bank of Kigali Plc" } });
  assert.equal(t.personalBankName, UMWALIMU_SACCO);
  const body = submissionOf(rulesFor("TEACHER"), { ...teacher, personalBankName: "x", schoolBankName: "y", personalAccountName: "  Jean  " });
  assert.equal(body.personalBankName, UMWALIMU_SACCO);
  assert.equal(body.schoolBankName, UMWALIMU_SACCO);
  assert.equal(body.personalAccountName, "Jean");
  assert.equal(body.personalAccountNumber, "123456789012");
});

test("no format is imposed beyond the agreed 12-digit rule: coaches' and school numbers and names are kept as given", () => {
  for (const n of ["1", "00-1234-5678", "ACC 77", "1234567890123456789012345"]) {
    assert.deepEqual(validateBanking(rulesFor("MENTOR"), { ...coach, personalAccountNumber: n, schoolAccountNumber: n }), {}, n);
    assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, schoolAccountNumber: n }), {}, n);
  }
  assert.deepEqual(validateBanking(rulesFor("MENTOR"), { ...coach, personalAccountName: "J" }), {});
});

test("a conflicting saved bank: shown, refused until confirmed, then sent with confirmReplace; other values untouched", () => {
  const rules = rulesFor("TEACHER");
  const details = { ...teacher, personalBankName: "Bank of Kigali Plc", schoolBankName: "Equity Bank Rwanda Plc" };
  const conflicts = conflictsOf({ rules, details });
  assert.deepEqual(conflicts, [{ field: "personalBankName", saved: "Bank of Kigali Plc" }, { field: "schoolBankName", saved: "Equity Bank Rwanda Plc" }]);
  // The backend's list wins when present.
  assert.deepEqual(conflictsOf({ rules, details, conflicts: [] }), []);
  const values = initialValues({ rules, details });
  assert.deepEqual(validateBanking(rules, values, conflicts, new Set()), {
    personalBankName: confirmReplaceMessage("Bank of Kigali Plc"), schoolBankName: confirmReplaceMessage("Equity Bank Rwanda Plc"),
  });
  assert.deepEqual(Object.keys(validateBanking(rules, values, conflicts, new Set(["personalBankName"]))), ["schoolBankName"]);
  const both = new Set(["personalBankName", "schoolBankName"]);
  assert.deepEqual(validateBanking(rules, values, conflicts, both), {});
  const body = submissionOf(rules, values, both);
  assert.deepEqual(body.confirmReplace, ["personalBankName", "schoolBankName"]);
  assert.equal(body.personalAccountNumber, teacher.personalAccountNumber);
  assert.equal(submissionOf(rules, values).confirmReplace, undefined, "nothing confirmed: nothing claimed");
  // Coach: only the school bank can conflict (the personal bank is chosen from the list).
  assert.deepEqual(conflictsOf({ rules: rulesFor("MENTOR"), details: { ...coach, schoolBankName: "Bank of Kigali Plc" } }), [{ field: "schoolBankName", saved: "Bank of Kigali Plc" }]);
});
