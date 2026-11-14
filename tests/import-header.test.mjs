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

// ─── Directory backends (schoolReferenceRequired): schools by code or id ───
import { importFormatFor, importHeader, importTemplate } from "../lib/import-header.ts";

test("the format follows the detected backend; UNKNOWN accepts both column sets", () => {
  assert.equal(importFormatFor({ schoolReferenceRequired: true, detectionState: "NEW" }), "directory");
  assert.equal(importFormatFor({ schoolReferenceRequired: false, detectionState: "NEW" }), "legacy");
  assert.equal(importFormatFor({ schoolReferenceRequired: false, detectionState: "LEGACY" }), "legacy");
  assert.equal(importFormatFor({ schoolReferenceRequired: false, detectionState: "UNKNOWN" }), "unknown");
  assert.equal(importFormatFor({ schoolReferenceRequired: false, detectionState: undefined }), "unknown");
});

test("directory format: schoolCode / schoolId accepted, its header and template are valid and carry no school name", () => {
  for (const f of ["directory", "unknown"]) {
    assert.equal(importHeaderProblems(importHeader(f), f), null);
    assert.equal(importHeaderProblems("firstName,lastName,email,schoolCode,schoolId,schoolName", f), null);
  }
  const [header, student] = importTemplate("directory").split("\r\n");
  assert.equal(importHeaderProblems(header, "directory"), null);
  assert.ok(!header.includes("schoolName"), "the template does not invite a name-only school");
  const row = Object.fromEntries(header.split(",").map((h, i) => [h, student.split(",")[i]]));
  assert.match(row.schoolCode, /^[1-5]\d{5}$/, "the example student has an official-format code");
});

test("legacy format refuses schoolCode / schoolId (the original backend does too) and says why", () => {
  assert.match(importHeaderProblems("firstName,lastName,email,schoolCode", "legacy"), /Unknown columns: schoolCode.*schoolName/);
  assert.equal(importHeaderProblems(importTemplate("legacy").split("\r\n")[0], "legacy"), null);
});
