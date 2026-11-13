/**
 * The user-import CSV header (`POST /admin/users/import`), checked exactly as
 * the backend does (src/users/user-provisioning.service.ts): names are
 * case-sensitive, any order; unknown or empty columns make the file invalid.
 *
 * Two backends, two formats:
 * - "legacy" (the original backend): a student's school is a free-text
 *   `schoolName` (+ `schoolLocation`); the backend creates the school.
 * - "directory" (backends advertising `schoolReferenceRequired`): a student's
 *   school must be an EXISTING school, given by its official `schoolCode` or
 *   its `schoolId`. A name alone is refused per row (SCHOOL_REFERENCE_REQUIRED).
 * - "unknown" (detection failed): both column sets are accepted here; the
 *   backend stays the authority and its INVALID_CSV_HEADER answer is shown.
 */
export type ImportFormat = "legacy" | "directory" | "unknown";

const LEGACY_COLUMNS = ["firstName", "lastName", "email", "role", "gradeLevel", "schoolName", "schoolLocation", "homeLocation", "username"];
const DIRECTORY_COLUMNS = ["firstName", "lastName", "email", "role", "gradeLevel", "schoolCode", "schoolId", "schoolName", "schoolLocation", "homeLocation", "username"];
const REQUIRED = ["firstName", "lastName", "email"];

/** The format for the detected backend (`hasFeature(detection, "schoolReferenceRequired")`, detection state). */
export function importFormatFor(input: { schoolReferenceRequired: boolean; detectionState: "NEW" | "LEGACY" | "UNKNOWN" | undefined }): ImportFormat {
  if (input.schoolReferenceRequired) return "directory";
  return input.detectionState === "LEGACY" || input.detectionState === "NEW" ? "legacy" : "unknown";
}

const columnsFor = (format: ImportFormat) => (format === "legacy" ? LEGACY_COLUMNS : DIRECTORY_COLUMNS);

/** The header shown to the administrator (and used in the template). */
export function importHeader(format: ImportFormat): string {
  return format === "directory"
    ? "firstName,lastName,email,role,gradeLevel,schoolCode,schoolId,homeLocation,username"
    : LEGACY_COLUMNS.join(",");
}

/** A template whose example rows the given backend accepts. */
export function importTemplate(format: ImportFormat): string {
  const header = importHeader(format);
  if (format === "directory") {
    return (
      `${header}\r\n` +
      // An official 6-digit code (first digit = province), or leave it empty and give the school's id.
      "Aline,Uwase,aline@example.org,STUDENT,S2,110101,,Kigali,\r\n" +
      "Eric,Mugabo,eric@example.org,MENTOR,,,,,\r\n"
    );
  }
  return `${header}\r\n` + "Aline,Uwase,aline@example.org,STUDENT,S2,Example School,Kigali,Kigali,\r\n" + "Eric,Mugabo,eric@example.org,MENTOR,,,,,\r\n";
}

/** How a student's school is given in this format (one sentence for the dialog). */
export function importSchoolHint(format: ImportFormat): string {
  if (format === "directory") {
    return "Students' schools must already exist: give the official schoolCode (6 digits) or the schoolId from Schools. A school name alone is refused.";
  }
  if (format === "unknown") {
    return "The server could not be identified: give schoolCode or schoolId for a student's school when the server requires an existing school; otherwise schoolName.";
  }
  return "schoolName creates the school when it does not exist yet.";
}

/** Kept for existing callers: the legacy format. */
export const IMPORT_HEADER = importHeader("legacy");
export const IMPORT_TEMPLATE = importTemplate("legacy");

/** A readable explanation of what is wrong with a header line, or null when it is valid. */
export function importHeaderProblems(firstLine: string, format: ImportFormat = "legacy"): string | null {
  const columns = columnsFor(format);
  const headers = firstLine
    .replace(/^﻿/, "")
    .split(",")
    .map((h) => h.trim().replace(/^"(.*)"$/, "$1").trim());
  const missing = REQUIRED.filter((c) => !headers.includes(c));
  const unknown = headers.filter((h) => !columns.includes(h));
  if (!missing.length && !unknown.length) return null;

  const parts: string[] = [];
  if (headers.includes("Student") && headers.includes("Enrolment status")) {
    parts.push("This is a students export (a report), not an import file. Start from the template instead.");
  }
  if (missing.length) parts.push(`Missing columns: ${missing.join(", ")}.`);
  const named = unknown.filter((h) => h !== "");
  if (named.length) parts.push(`Unknown columns: ${named.join(", ")}.`);
  if (format === "legacy" && named.some((h) => h === "schoolCode" || h === "schoolId")) {
    parts.push("This server identifies a student's school by schoolName.");
  }
  if (unknown.includes("")) parts.push("The header has an empty column (delete empty columns at the end of the sheet).");
  parts.push("Column names must match exactly, including capital letters.");
  return parts.join(" ");
}
