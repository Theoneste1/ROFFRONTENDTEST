/**
 * School CSV / XLSX import (backend src/schools/import/**): pure rules for the import page
 * (unit-tested in tests/school-import.test.mjs). The backend stays the authority: an import is
 * all-or-nothing (any invalid row → 422, nothing created), only ever CREATES schools (an existing
 * code is a row error; no school is updated), and rows with possible duplicates need the dry
 * run's review token (409 otherwise).
 */
import { errorMessage, isApiError } from "../api/errors";
import type {
  ImportPossibleDuplicate,
  ImportRowErrors,
  SchoolImportDone,
  SchoolImportDryRun,
  SchoolImportQuery,
} from "../api/school-directory";

/** Backend IMPORT_MAX_BYTES / IMPORT_MAX_ROWS. */
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_COLUMNS = ["name", "countryCode", "code", "province", "district", "sector", "location", "ownership"] as const;

/** Why this file cannot be sent, or null. */
export function importFileProblem(file: { name: string; size: number } | null | undefined): string | null {
  if (!file) return "Choose a .csv or .xlsx file.";
  if (!/\.(csv|xlsx)$/i.test(file.name)) return "The file must be a .csv or .xlsx file (use the template).";
  if (file.size === 0) return "The file is empty.";
  if (file.size > IMPORT_MAX_BYTES) return "The file is larger than 1 MB. Split it into smaller files.";
  return null;
}

export type ImportRowStatus = "error" | "duplicate";

/** One row the administrator must look at: an error (blocks the import) or possible duplicates (needs confirming). */
export interface ImportPreviewRow {
  row: number;
  status: ImportRowStatus;
  name: string | null;
  messages: string[];
  candidates: ImportPossibleDuplicate["candidates"];
}

/** What the page shows after a dry run (or a refused import that sent the same information). */
export interface ImportPreview {
  totalRows: number;
  valid: number;
  failed: number;
  rows: ImportPreviewRow[];
  possibleDuplicateRows: number;
  reviewToken: string | null;
  reviewExpiresAt: string | null;
  canImport: boolean;
}

/** Per-row results, sorted by row: errors and possible duplicates (rows not listed are valid). */
export function previewRows(errors: readonly ImportRowErrors[], duplicates: readonly ImportPossibleDuplicate[]): ImportPreviewRow[] {
  const out: ImportPreviewRow[] = [
    ...errors.map((e) => ({ row: e.row, status: "error" as const, name: null, messages: [...e.errors], candidates: [] })),
    ...duplicates.map((d) => ({
      row: d.row,
      status: "duplicate" as const,
      name: d.name,
      messages: [`${d.candidates.length} existing school${d.candidates.length === 1 ? "" : "s"} with the same name nearby.`],
      candidates: [...d.candidates],
    })),
  ];
  return out.sort((a, b) => a.row - b.row || (a.status === b.status ? 0 : a.status === "error" ? -1 : 1));
}

export function previewFromDryRun(r: SchoolImportDryRun): ImportPreview {
  return {
    totalRows: r.totalRows,
    valid: r.valid,
    failed: r.failed,
    rows: previewRows(r.errors, r.possibleDuplicates),
    possibleDuplicateRows: r.possibleDuplicates.length,
    reviewToken: r.reviewToken ?? null,
    reviewExpiresAt: r.reviewExpiresAt ?? null,
    canImport: r.canImport,
  };
}

/** Whether the import can be sent now, and what is missing. */
export function importReadiness(preview: ImportPreview | null, duplicatesConfirmed: boolean): { ready: boolean; reason: string | null } {
  if (!preview) return { ready: false, reason: "Check the file first (dry run)." };
  if (!preview.canImport || preview.failed > 0) return { ready: false, reason: "Fix the rows with errors and check the file again: nothing is imported while any row is invalid." };
  if (preview.totalRows === 0) return { ready: false, reason: "The file has no schools." };
  if (preview.possibleDuplicateRows > 0) {
    if (!preview.reviewToken) return { ready: false, reason: "Check the file again to review the possible duplicates." };
    if (!duplicatesConfirmed) return { ready: false, reason: "Confirm that you reviewed the possible duplicates." };
  }
  return { ready: true, reason: null };
}

/** The query of the real import: the review token only when duplicates were confirmed. */
export function importQuery(preview: ImportPreview, duplicatesConfirmed: boolean): SchoolImportQuery {
  if (preview.possibleDuplicateRows > 0 && duplicatesConfirmed && preview.reviewToken) {
    return { confirmPossibleDuplicates: true, reviewToken: preview.reviewToken };
  }
  return {};
}

export interface ImportRefusal {
  /** A new preview to show (422 row errors; 409 duplicates with a fresh token), or null. */
  preview: ImportPreview | null;
  /** The message for the whole page. */
  message: string;
  /** 409: the administrator must review (again) and confirm. */
  needsReview: boolean;
}

const dupList = (v: unknown): ImportPossibleDuplicate[] =>
  Array.isArray(v) ? v.filter((d): d is ImportPossibleDuplicate => !!d && typeof d === "object" && typeof (d as ImportPossibleDuplicate).row === "number" && Array.isArray((d as ImportPossibleDuplicate).candidates)) : [];
const errList = (v: unknown): ImportRowErrors[] =>
  Array.isArray(v) ? v.filter((e): e is ImportRowErrors => !!e && typeof e === "object" && typeof (e as ImportRowErrors).row === "number" && Array.isArray((e as ImportRowErrors).errors)) : [];

/** Maps a refused dry run or import (branching on `code`) to what the page shows. */
export function interpretImportError(err: unknown, totalRows: number | null = null): ImportRefusal {
  if (!isApiError(err)) return { preview: null, message: errorMessage(err), needsReview: false };
  const d = (err.details && typeof err.details === "object" ? err.details : {}) as Record<string, unknown>;
  switch (err.code) {
    case "IMPORT_INVALID": {
      const errors = errList(d.errors);
      const duplicates = dupList(d.possibleDuplicates);
      const total = totalRows ?? errors.length;
      return {
        preview: {
          totalRows: total, valid: Math.max(0, total - errors.length), failed: errors.length, rows: previewRows(errors, duplicates),
          possibleDuplicateRows: duplicates.length, reviewToken: null, reviewExpiresAt: null, canImport: false,
        },
        message: "Nothing was imported: fix the rows listed and upload the file again.",
        needsReview: false,
      };
    }
    case "POSSIBLE_DUPLICATES_UNCONFIRMED":
    case "IMPORT_REVIEW_OUTDATED": {
      const duplicates = dupList(d.possibleDuplicates);
      const total = totalRows ?? duplicates.length;
      return {
        preview: {
          totalRows: total, valid: total, failed: 0, rows: previewRows([], duplicates), possibleDuplicateRows: duplicates.length,
          reviewToken: typeof d.reviewToken === "string" ? d.reviewToken : null,
          reviewExpiresAt: typeof d.reviewExpiresAt === "string" ? d.reviewExpiresAt : null, canImport: true,
        },
        message: err.code === "IMPORT_REVIEW_OUTDATED"
          ? "The possible duplicates changed (or your review expired). Nothing was imported: review them again, then confirm."
          : "Some schools may already exist. Nothing was imported: review the possible duplicates, then confirm.",
        needsReview: true,
      };
    }
    case "INVALID_IMPORT_HEADER": {
      const parts: string[] = [];
      const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x) => typeof x === "string") : []);
      if (list("missing").length) parts.push(`missing column${list("missing").length === 1 ? "" : "s"}: ${list("missing").join(", ")}`);
      if (list("unknown").length) parts.push(`unknown column${list("unknown").length === 1 ? "" : "s"}: ${list("unknown").join(", ")}`);
      if (list("repeated").length) parts.push(`repeated: ${list("repeated").join(", ")}`);
      return {
        preview: null,
        message: `The header row does not match the template${parts.length ? ` (${parts.join("; ")})` : ""}. Expected: ${IMPORT_COLUMNS.join(", ")}.`,
        needsReview: false,
      };
    }
    case "INVALID_REVIEW_TOKEN":
    case "REVIEW_TOKEN_REQUIRED":
      return { preview: null, message: "The review is not valid for this file. Check the file again, then confirm.", needsReview: true };
    default:
      return { preview: null, message: errorMessage(err), needsReview: false };
  }
}

/** The result sentence after an import. Existing schools are never changed by an import. */
export function importDoneSummary(r: SchoolImportDone): string {
  const n = (x: number, one: string, many: string) => `${x.toLocaleString("en-US")} ${x === 1 ? one : many}`;
  const confirmed = r.confirmedPossibleDuplicates ? ` (${n(r.confirmedPossibleDuplicates, "confirmed possible duplicate", "confirmed possible duplicates")})` : "";
  return `${n(r.created, "school was", "schools were")} created from ${n(r.totalRows, "row", "rows")}${confirmed}. No existing school was changed.`;
}
