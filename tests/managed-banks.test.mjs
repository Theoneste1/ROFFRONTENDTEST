// The bank list (owner 2026-11-27): frontend mirror of the backend rules (lib/accounts/banking.ts) and the Super
// Administrator's Banks page helpers (lib/admin/banks.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialValues, numberInstruction, numberProblemFor, submissionOf, validateBanking, SACCO_NUMBER_MESSAGE, GENERAL_NUMBER_MESSAGE } from "@/lib/accounts/banking";
import { bodyOf, draftInstruction, draftProblems, banksNavVisible } from "@/lib/admin/banks";

const SACCO = "Umwalimu SACCO";
const BK = "Bank of Kigali Plc";
const opt = (name, min = null, max = min) => ({ name, active: true, minDigits: min, maxDigits: max,
  instruction: name === SACCO ? SACCO_NUMBER_MESSAGE : min === null ? GENERAL_NUMBER_MESSAGE : min === max ? `${name} account numbers must contain exactly ${min} digits.` : `${name} account numbers must contain between ${min} and ${max} digits.` });
const rules = (teacher = true) => ({
  personalBank: "LIST", schoolBank: "LIST", fixedBank: SACCO, banks: [BK, "Ten Bank", SACCO],
  bankOptions: [opt(BK), opt("Ten Bank", 10), opt(SACCO, 12)], generalInstruction: GENERAL_NUMBER_MESSAGE,
  personalNumberDigits: null, schoolNumberDigits: null, schoolRequired: teacher,
  fields: teacher ? ["personalAccountName", "personalBankName", "personalAccountNumber", "schoolAccountName", "schoolBankName", "schoolAccountNumber"] : ["personalAccountName", "personalBankName", "personalAccountNumber"],
});
const teacher = (over = {}) => ({
  personalAccountName: "Aline Uwase", personalBankName: SACCO, personalAccountNumber: "123456789012",
  schoolAccountName: "GS Kigali", schoolBankName: SACCO, schoolAccountNumber: "210987654321", ...over,
});

test("Umwalimu SACCO: exactly 12 digits; fewer, more, letters and other characters refused with the exact sentence", () => {
  assert.equal(numberProblemFor(rules(), SACCO, "123456789012"), null);
  for (const bad of ["12345678901", "1234567890123", "12345678901a", "1234 5678 9012", "1234-5678-901"]) assert.equal(numberProblemFor(rules(), SACCO, bad), SACCO_NUMBER_MESSAGE);
  assert.equal(SACCO_NUMBER_MESSAGE, "Umwalimu SACCO account numbers must contain exactly 12 digits.");
});

test("the instruction follows the chosen bank and changes as soon as the bank changes", () => {
  assert.equal(numberInstruction(rules(), SACCO), SACCO_NUMBER_MESSAGE);
  assert.equal(numberInstruction(rules(), "Ten Bank"), "Ten Bank account numbers must contain exactly 10 digits.");
  assert.equal(numberInstruction(rules(), BK), GENERAL_NUMBER_MESSAGE);
  assert.equal(numberInstruction(rules(), ""), "Choose the bank first: the account number's rule depends on it.");
});

test("another bank is never held to the 12-digit SACCO rule", () => {
  assert.deepEqual(validateBanking(rules(), teacher({ personalBankName: BK, personalAccountNumber: "00040-1234567-89" })), {});
  assert.deepEqual(validateBanking(rules(), teacher({ personalBankName: "Ten Bank", personalAccountNumber: "123456789012" })),
    { personalAccountNumber: "Ten Bank account numbers must contain exactly 10 digits." });
});

test("teachers start with Umwalimu SACCO suggested; their choices are sent as chosen; coaches send no school fields", () => {
  const v = initialValues({ details: null, rules: rules() });
  assert.equal(v.personalBankName, SACCO);
  assert.equal(v.schoolBankName, SACCO);
  assert.deepEqual(submissionOf(rules(), teacher({ schoolBankName: BK })).schoolBankName, BK);
  assert.deepEqual(Object.keys(submissionOf(rules(false), teacher())).sort(), ["personalAccountName", "personalAccountNumber", "personalBankName"]);
});

test("a bank no longer offered is accepted only when it is the one already saved; an unchanged number is not refused", () => {
  const saved = { personalAccountName: "Jean Mentor", personalBankName: "Old Bank", personalAccountNumber: "7" };
  const v = { ...teacher(), ...saved };
  assert.deepEqual(validateBanking(rules(false), v, [], new Set(), saved), {});
  assert.deepEqual(validateBanking(rules(false), { ...v, personalBankName: "Other Bank" }, [], new Set(), saved), { personalBankName: "Choose the bank from the list.", personalAccountNumber: GENERAL_NUMBER_MESSAGE });
});

test("Banks page: problems in plain words, the body sent, the instruction shown, Super Administrators only", () => {
  const rows = [
    { name: SACCO, active: false, kind: "GENERAL", min: "", max: "", accounts: 3, accountsNotFollowingRule: 0, isNew: false },
    { name: "Ten Bank", active: true, kind: "EXACT", min: "10", max: "", accounts: 0, accountsNotFollowingRule: 0, isNew: true },
    { name: "ten bank", active: true, kind: "GENERAL", min: "", max: "", accounts: 0, accountsNotFollowingRule: 0, isNew: true },
    { name: "Range Bank", active: true, kind: "RANGE", min: "14", max: "9", accounts: 0, accountsNotFollowingRule: 0, isNew: true },
  ];
  assert.deepEqual(draftProblems(rows), { 2: "This bank is already in the list.", 3: "The smallest number of digits cannot be larger than the largest." });
  assert.deepEqual(bodyOf(rows.slice(0, 2)), [
    { name: SACCO, active: true, minDigits: 12, maxDigits: 12 },
    { name: "Ten Bank", active: true, minDigits: 10, maxDigits: 10 },
  ]);
  assert.equal(draftInstruction(rows[1]), "Ten Bank account numbers must contain exactly 10 digits.");
  const detection = { features: new Set(["managedBanks"]) };
  assert.equal(banksNavVisible(detection, "ADMIN"), false);
});
