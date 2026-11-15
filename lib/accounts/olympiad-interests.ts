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
