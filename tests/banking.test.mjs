// Banking information (owner 2026-11-25, final requirements): the frontend's copy of the rules (lib/accounts/banking.ts)
// answers like the backend's (src/banking/banking-rules.ts), which decides. The step shows for Teachers, Coaches and Head
// Coaches only. Teachers give six fields; Coaches and Head Coaches the three personal ones (no school details).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  asksSchool, BANKS, confirmReplaceMessage, conflictsOf, initialValues, NAME_DIGIT_MESSAGES, needsBanking, requiredFieldsOf, rulesFor, SCHOOL_NUMBER_MESSAGE, submissionOf, TEACHER_NUMBER_MESSAGE,
  UMWALIMU_SACCO, validateBanking,
} from "../lib/accounts/banking.ts";
import { KNOWN_FEATURES } from "../lib/api/capabilities.ts";

const teacher = {
  personalAccountName: "Jean Uwase", personalBankName: UMWALIMU_SACCO, personalAccountNumber: "123456789012",
  schoolAccountName: "GS Kigali", schoolBankName: UMWALIMU_SACCO, schoolAccountNumber: "400100004567",
};
// A coach's form values: the three personal fields; the school fields are empty (never asked).
const coach = {
  personalAccountName: "Eric Coach", personalBankName: "Bank of Kigali Plc", personalAccountNumber: "00012345678",
  schoolAccountName: "", schoolBankName: "", schoolAccountNumber: "",
};
const PERSONAL = ["personalAccountName", "personalBankName", "personalAccountNumber"];

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
  assert.deepEqual(rulesFor("TEACHER"), {
    personalBank: "FIXED", schoolBank: "FIXED", fixedBank: UMWALIMU_SACCO, banks: [UMWALIMU_SACCO], personalNumberDigits: 12, schoolNumberDigits: 12,
    schoolRequired: true, fields: ["personalAccountName", "personalBankName", "personalAccountNumber", "schoolAccountName", "schoolBankName", "schoolAccountNumber"],
  });
  assert.equal(rulesFor("MENTOR").personalBank, "LIST");
  assert.equal(rulesFor("MENTOR").schoolRequired, false);
  assert.deepEqual(rulesFor("MENTOR").fields, PERSONAL);
  assert.deepEqual(rulesFor("HEAD_COACH"), rulesFor("MENTOR"));
});

test("teachers give six fields, coaches and head coaches three; an older backend (no schoolRequired) asked everyone", () => {
  assert.equal(requiredFieldsOf(rulesFor("TEACHER")).length, 6);
  for (const role of ["MENTOR", "HEAD_COACH"]) {
    assert.deepEqual([...requiredFieldsOf(rulesFor(role))], PERSONAL);
    assert.equal(asksSchool(rulesFor(role)), false);
  }
  const older = { ...rulesFor("MENTOR"), schoolRequired: undefined, fields: undefined };
  assert.equal(asksSchool(older), true);
  assert.equal(requiredFieldsOf(older).length, 6);
});

test("teacher: a valid 12-digit number passes; 11, 13, letters or symbols get the exact message", () => {
  assert.deepEqual(validateBanking(rulesFor("TEACHER"), teacher), {});
  for (const n of ["12345678901", "1234567890123", "12345678901A", "1234 5678 9012", "123456-789012", ""]) {
    assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, personalAccountNumber: n }), { personalAccountNumber: TEACHER_NUMBER_MESSAGE }, n);
  }
});

test("coach and head coach: three personal fields complete it; empty school fields never refused; a bank from the list; no 12-digit rule", () => {
  for (const role of ["MENTOR", "HEAD_COACH"]) {
    assert.deepEqual(validateBanking(rulesFor(role), coach), {}, "school fields empty: fine");
    // Each missing personal field is still refused.
    for (const f of PERSONAL) assert.deepEqual(Object.keys(validateBanking(rulesFor(role), { ...coach, [f]: "" })), [f], f);
    assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalBankName: "My Own Bank" }), { personalBankName: "Choose your bank from the list." });
    assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalBankName: "" }), { personalBankName: "Bank name is required." });
    assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalAccountNumber: "123456" }), {});
  }
});

test("every missing field is named; saved values are kept, the fixed banks filled in; the submission sends Umwalimu SACCO", () => {
  const empty = initialValues({ rules: rulesFor("MENTOR"), details: null });
  assert.deepEqual(Object.keys(validateBanking(rulesFor("MENTOR"), empty)).sort(), ["personalAccountName", "personalAccountNumber", "personalBankName"]);
  assert.deepEqual(Object.keys(validateBanking(rulesFor("TEACHER"), initialValues({ rules: rulesFor("TEACHER"), details: null }))).sort(),
    ["personalAccountName", "personalAccountNumber", "schoolAccountName", "schoolAccountNumber"]);
  const kept = initialValues({ rules: rulesFor("MENTOR"), details: { personalAccountName: "Partial Person", personalBankName: "Ecobank Rwanda Plc" } });
  assert.equal(kept.personalAccountName, "Partial Person");
  assert.equal(kept.personalBankName, "Ecobank Rwanda Plc");
  assert.equal(kept.schoolBankName, "", "a coach's school bank is not filled in (not asked)");
  // A teacher's saved other bank is shown as replaced on submit (never silently by the system).
  const t = initialValues({ rules: rulesFor("TEACHER"), details: { personalBankName: "Bank of Kigali Plc" } });
  assert.equal(t.personalBankName, UMWALIMU_SACCO);
  const body = submissionOf(rulesFor("TEACHER"), { ...teacher, personalBankName: "x", schoolBankName: "y", personalAccountName: "  Jean  " });
  assert.equal(body.personalBankName, UMWALIMU_SACCO);
  assert.equal(body.schoolBankName, UMWALIMU_SACCO);
  assert.equal(body.personalAccountName, "Jean");
  assert.equal(body.personalAccountNumber, "123456789012");
  assert.equal(body.schoolAccountName, "GS Kigali");
});

test("a coach's submission sends the three personal fields only: school details saved earlier are never touched", () => {
  for (const role of ["MENTOR", "HEAD_COACH"]) {
    const rules = rulesFor(role);
    const details = { personalAccountName: "Legacy Coach", personalBankName: "Ecobank Rwanda Plc", personalAccountNumber: "009988", schoolAccountName: "GS Legacy", schoolBankName: "Bank of Kigali Plc", schoolAccountNumber: "4002222" };
    const values = initialValues({ rules, details });
    assert.equal(values.schoolBankName, "Bank of Kigali Plc", "the saved school bank is not replaced in the form");
    assert.deepEqual(validateBanking(rules, values, conflictsOf({ rules, details })), {});
    assert.deepEqual(submissionOf(rules, { ...values, personalAccountName: " Legacy Coach " }), { personalAccountName: "Legacy Coach", personalBankName: "Ecobank Rwanda Plc", personalAccountNumber: "009988" });
    // Even a stray confirmation never sends a school replacement for a coach.
    assert.equal(submissionOf(rules, values, new Set(["schoolBankName"])).confirmReplace, undefined);
  }
});

test("account names: no digit (teacher personal and school; coach and head coach personal), the exact messages", () => {
  for (const name of ["Jean 2", "GS 1", "0", "Ecole8"]) {
    assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, personalAccountName: name, schoolAccountName: name }),
      { personalAccountName: NAME_DIGIT_MESSAGES.personalAccountName, schoolAccountName: NAME_DIGIT_MESSAGES.schoolAccountName }, name);
    for (const role of ["MENTOR", "HEAD_COACH"]) {
      assert.deepEqual(validateBanking(rulesFor(role), { ...coach, personalAccountName: name }), { personalAccountName: NAME_DIGIT_MESSAGES.personalAccountName }, name);
    }
  }
  for (const name of ["Jean-Pierre N'Dayisaba", "G.S. Saint-Joseph", "Éric Uwimana"]) {
    assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, personalAccountName: name, schoolAccountName: name }), {}, name);
  }
  // A coach's school name is not asked, so not checked.
  assert.deepEqual(validateBanking(rulesFor("MENTOR"), { ...coach, schoolAccountName: "School 2" }), {});
});

test("teacher: the school number is exactly 12 digits too (the exact message); coaches' numbers keep no format", () => {
  for (const n of ["1", "4001234567", "40012345678", "4001234567890", "40012345678A", "4001 2345 6789", "4001-2345-6789", ""]) {
    assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, schoolAccountNumber: n }), { schoolAccountNumber: SCHOOL_NUMBER_MESSAGE }, n);
  }
  assert.deepEqual(validateBanking(rulesFor("TEACHER"), { ...teacher, schoolAccountNumber: "000000000123" }), {});
  // An older backend (no schoolNumberDigits): the form does not add a rule the backend does not have.
  assert.deepEqual(validateBanking({ ...rulesFor("TEACHER"), schoolNumberDigits: undefined }, { ...teacher, schoolAccountNumber: "4001" }), {});
  for (const n of ["1", "00-1234-5678", "ACC 77", "1234567890123456789012345"]) {
    assert.deepEqual(validateBanking(rulesFor("MENTOR"), { ...coach, personalAccountNumber: n, schoolAccountNumber: n }), {}, n);
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
  // Coach and Head Coach: no conflict at all — the personal bank is chosen from the list, and a saved school bank is
  // not asked (kept as it is, no confirmation prompt).
  for (const role of ["MENTOR", "HEAD_COACH"]) {
    assert.deepEqual(conflictsOf({ rules: rulesFor(role), details: { ...coach, schoolBankName: "Bank of Kigali Plc" } }), [], role);
  }
});
