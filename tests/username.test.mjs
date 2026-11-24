// Usernames (owner feedback 2026-11-24): every message says what is wrong with what was typed and offers a username
// that works; the rule itself is unchanged (3–30 of a–z, 0–9, ".", "_", "-").
import { test } from "node:test";
import assert from "node:assert/strict";
import { USERNAME_HINT, USERNAME_PATTERN, suggestUsername, usernameProblem } from "../lib/accounts/username.ts";

test("a valid username has no problem; the rule is unchanged", () => {
  for (const ok of ["tuyizere2010", "theoneste.nsanza", "a_b-c", "abc", "a".repeat(30)]) assert.equal(usernameProblem(ok), null, ok);
  assert.equal(USERNAME_PATTERN.source, "^[a-z0-9._-]{3,30}$");
});

test("the owner's example — an e-mail address in quotation marks — is explained, with a working suggestion", () => {
  const m = usernameProblem('"tuyizerethe1997,_@gmail.com"');
  assert.match(m, /^A username is not an e-mail address\. Use only the part before “@”/);
  assert.match(m, /For example: tuyizerethe1997$/);
  assert.equal(suggestUsername('"tuyizerethe1997,_@gmail.com"'), "tuyizerethe1997");
});

test("each kind of mistake gets its own plain message, with a suggestion when one can be made", () => {
  assert.match(usernameProblem("jean@gmail.com"), /not an e-mail address.*For example: jean$/);
  assert.match(usernameProblem('"jean.paul"'), /^Remove the quotation marks\. For example: jean\.paul$/);
  assert.match(usernameProblem("jean paul"), /cannot contain spaces.*For example: jean\.paul$/);
  assert.match(usernameProblem("JeanPaul"), /^Use small letters only\. For example: jeanpaul$/);
  assert.match(usernameProblem("ab"), /at least 3 characters/);
  assert.match(usernameProblem("a".repeat(31)), /at most 30 characters \(this one has 31\)/);
  assert.match(usernameProblem("jean#paul!"), /These characters cannot be used: # !.*For example: jeanpaul$/);
  assert.match(usernameProblem("Élise"), /For example: elise$/);
  assert.match(usernameProblem(""), /^Choose a username/);
  assert.match(usernameProblem("   "), /^Choose a username/);
});

test("every suggestion itself follows the rule", () => {
  for (const typed of ['"tuyizerethe1997,_@gmail.com"', "Jean Paul", "Ndayishimiye  Émile!!", "a..b__c--", "x".repeat(50), "MUGISHA_Eric@yahoo.fr"]) {
    const s = suggestUsername(typed);
    assert.ok(s === null || USERNAME_PATTERN.test(s), `${typed} -> ${s}`);
  }
  assert.equal(suggestUsername("@@"), null);
});

test("the hint under the field says what a username is for", () => {
  assert.match(USERNAME_HINT, /sign in with — not your e-mail address/);
});
