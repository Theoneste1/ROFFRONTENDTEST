/**
 * The user-import CSV header (`POST /admin/users/import`), checked exactly as
 * the backend does (src/users/user-provisioning.service.ts): names are
 * case-sensitive, any order; unknown or empty columns make the file invalid.
 */
export const IMPORT_HEADER = "firstName,lastName,email,role,gradeLevel,schoolName,schoolLocation,homeLocation,username";
const COLUMNS = IMPORT_HEADER.split(",");
const REQUIRED = ["firstName", "lastName", "email"];

export const IMPORT_TEMPLATE =
  `${IMPORT_HEADER}\r\n` +
  "Aline,Uwase,aline@example.org,STUDENT,S2,Example School,Kigali,Kigali,\r\n" +
  "Eric,Mugabo,eric@example.org,MENTOR,,,,,\r\n";

/** A readable explanation of what is wrong with a header line, or null when it is valid. */
export function importHeaderProblems(firstLine: string): string | null {
  const headers = firstLine
    .replace(/^﻿/, "")
    .split(",")
    .map((h) => h.trim().replace(/^"(.*)"$/, "$1").trim());
  const missing = REQUIRED.filter((c) => !headers.includes(c));
  const unknown = headers.filter((h) => !COLUMNS.includes(h));
  if (!missing.length && !unknown.length) return null;

  const parts: string[] = [];
  if (headers.includes("Student") && headers.includes("Enrolment status")) {
    parts.push("This is a students export (a report), not an import file. Start from the template instead.");
  }
  if (missing.length) parts.push(`Missing columns: ${missing.join(", ")}.`);
  const named = unknown.filter((h) => h !== "");
  if (named.length) parts.push(`Unknown columns: ${named.join(", ")}.`);
  if (unknown.includes("")) parts.push("The header has an empty column (delete empty columns at the end of the sheet).");
  parts.push("Column names must match exactly, including capital letters.");
  return parts.join(" ");
}
