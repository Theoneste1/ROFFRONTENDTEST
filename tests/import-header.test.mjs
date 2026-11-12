import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPORT_HEADER, IMPORT_TEMPLATE, importHeaderProblems } from "../lib/import-header.ts";

test("the import header and the template header are valid", () => {
  assert.equal(importHeaderProblems(IMPORT_HEADER), null);
  assert.equal(importHeaderProblems(IMPORT_TEMPLATE.split("\r\n")[0]), null);
  assert.equal(importHeaderProblems("\uFEFFemail,firstName,lastName"), null); // BOM, any order, optional columns left out
  assert.equal(importHeaderProblems('"firstName","lastName","email"'), null);
});

test("a students export is explained, not just refused", () => {
  const p = importHeaderProblems("Student,Username,Email,Status,Division,Grade,School,Enrolment status,Submissions,Results published,Points,Registered,Activated,Last login");
  assert.match(p, /students export/);
  assert.match(p, /Missing columns: firstName, lastName, email/);
  assert.match(p, /Unknown columns: Student, Username, Email/);
});

test("wrong capitals and empty trailing columns are reported", () => {
  assert.match(importHeaderProblems("FirstName,lastName,email"), /Missing columns: firstName.*Unknown columns: FirstName/);
  assert.match(importHeaderProblems("firstName,lastName,email,,"), /empty column/);
});
