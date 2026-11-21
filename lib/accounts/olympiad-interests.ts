/**
 * Students' Olympiad interests (owner decision 8): Mathematics, Computing and Physics, several at
 * once. Pure logic, unit-tested in tests/olympiad-interests.test.mjs.
 *
 * - Only on a backend advertising `studentOlympiadInterests` (GET /api/v1): older backends refuse
 *   the field (400), so the sign-up form and the profile neither show nor send it there.
 * - The sign-up form requires at least one; the profile edits them (at least one when saved).
 * - Information only: interests never change programme membership or permissions.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { OlympiadSubject } from "../api/teacher-registration";
import { OLYMPIAD_SUBJECTS, subjectLabel, toggleInterest } from "./teacher-registration";

export { OLYMPIAD_SUBJECTS, subjectLabel, toggleInterest };
export type { OlympiadSubject };

export const INTERESTS_REQUIRED = "Choose at least one Olympiad: Mathematics, Computing or Physics.";

/** The backend accepts and returns `olympiadInterests` for students. */
export function studentInterestsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "studentOlympiadInterests");
}

/** The error to show, or undefined when the choice is valid (at least one). */
export function validateInterests(interests: readonly OlympiadSubject[]): string | undefined {
  return interests.length === 0 ? INTERESTS_REQUIRED : undefined;
}

/** Known subjects only, in the official order, without duplicates. */
export function normaliseInterests(values: readonly string[] | null | undefined): OlympiadSubject[] {
  const chosen = new Set(values ?? []);
  return OLYMPIAD_SUBJECTS.map((s) => s.value).filter((v) => chosen.has(v));
}

/** "Mathematics, Physics"; "" when none was chosen. Unknown values are shown as sent. */
export function interestsText(values: readonly string[] | null | undefined): string {
  return (values ?? []).map(subjectLabel).join(", ");
}

/** Same subjects (order ignored). */
export function sameInterests(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const x = normaliseInterests(a), y = normaliseInterests(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// ─── "Other" Olympiad interest (owner, 2026-11-21; capability olympiadInterestOther) ───────────────────────────────
// Beside the three subjects, a person may tick "Other" and name another Olympiad in words (e.g. Chemistry). In a form
// the value is null while "Other" is not ticked (always on backends without the capability), else the text typed.
// "Other" alone counts as an interest. It is never a subject: it grants nothing.

export const OTHER_INTEREST_MIN = 2;
export const OTHER_INTEREST_MAX = 100;
export const OTHER_INTEREST_PROBLEM = "Name the other Olympiad (2–100 characters), for example Chemistry.";

/** The backend accepts `olympiadInterestOther`. */
export function otherInterestSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "olympiadInterestOther");
}

/**
 * The interests error, "Other" included: with Other ticked, its text must be 2–100 characters (and then no subject is
 * needed); without it, `required` = the message when no subject is chosen.
 */
export function validateInterestsWithOther(interests: readonly OlympiadSubject[], other: string | null, required: string = INTERESTS_REQUIRED): string | undefined {
  if (other !== null) {
    const n = other.trim().length;
    return n < OTHER_INTEREST_MIN || n > OTHER_INTEREST_MAX ? OTHER_INTEREST_PROBLEM : undefined;
  }
  return interests.length === 0 ? required : undefined;
}

/**
 * The request field: the trimmed text while Other is ticked; null to clear one stored before (`before`) when Other was
 * unticked; nothing otherwise (older backends never receive the field).
 */
export function otherInterestField(other: string | null, before?: string | null): { olympiadInterestOther?: string | null } {
  if (other !== null && other.trim()) return { olympiadInterestOther: other.trim() };
  if (other === null && before) return { olympiadInterestOther: null };
  return {};
}

/** "Mathematics, Physics, Other: Chemistry"; "" when nothing was chosen. */
export function interestsWithOtherText(values: readonly string[] | null | undefined, other: string | null | undefined): string {
  return [interestsText(values), other ? `Other: ${other}` : ""].filter(Boolean).join(", ");
}
