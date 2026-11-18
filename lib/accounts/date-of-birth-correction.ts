/**
 * Administrator date-of-birth correction (capability `dateOfBirthCorrection`): an Administrator (users.manage) corrects
 * a STUDENT's date of birth with a mandatory reason; every correction is recorded with the old and new dates and shown
 * as the account's date-of-birth history. Pure; tested in tests/date-of-birth-correction.test.mjs.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { ageOn, birthDateBounds, STUDENT_AGE } from "./student-details";
import { dateOfBirthText } from "./admin-user-details";

/** Backend CorrectDateOfBirthDto: reason 5–500 characters (trimmed). */
export const DOB_REASON = { min: 5, max: 500 } as const;

export { birthDateBounds };

/** Offered only for a student, on a backend that advertises it, to a viewer who can manage users. */
export function canCorrectDateOfBirth(
  detection: BackendDetection | null | undefined,
  role: string,
  canManageUsers: boolean,
): boolean {
  return role === "STUDENT" && canManageUsers && hasFeature(detection, "dateOfBirthCorrection");
}

/** The problem with a "YYYY-MM-DD" date of birth (a real past date, age 5–30 on `today`), or null. */
export function dateOfBirthProblem(value: string, today: Date = new Date()): string | null {
  if (!value) return "Enter the date of birth.";
  const age = ageOn(value, today);
  if (age === null) return "Enter a real date that is not in the future.";
  if (age < STUDENT_AGE.min || age > STUDENT_AGE.max) return `Students must be ${STUDENT_AGE.min} to ${STUDENT_AGE.max} years old.`;
  return null;
}

export function reasonProblem(reason: string): string | null {
  const n = reason.trim().length;
  return n < DOB_REASON.min || n > DOB_REASON.max ? `Give a reason of ${DOB_REASON.min}–${DOB_REASON.max} characters.` : null;
}

/** Problems by field; empty when the form can be sent. */
export function validateCorrection(draft: { dateOfBirth: string; reason: string }, today: Date = new Date()): { dateOfBirth?: string; reason?: string } {
  const e: { dateOfBirth?: string; reason?: string } = {};
  const d = dateOfBirthProblem(draft.dateOfBirth, today);
  if (d) e.dateOfBirth = d;
  const r = reasonProblem(draft.reason);
  if (r) e.reason = r;
  return e;
}

/** The PUT body for a valid draft. */
export function correctionBody(draft: { dateOfBirth: string; reason: string }) {
  return { dateOfBirth: draft.dateOfBirth, reason: draft.reason.trim() };
}

/** Backend error codes of this action → what to show. */
export const CORRECTION_ERRORS: Readonly<Record<string, string>> = {
  DATE_OF_BIRTH_UNCHANGED: "That is already the recorded date of birth.",
  NOT_A_STUDENT: "Only a student's date of birth can be corrected.",
};

// ─── History ────────────────────────────────────────────────────────────────

export interface DobActor {
  id: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export type DateOfBirthHistoryEntry =
  | { kind: "CORRECTED"; at: string; from: string | null; to: string | null; reason: string | null; by: DobActor | null; byRole: string | null }
  | { kind: "GIVEN_AT_FIRST_SIGN_IN"; at: string; by: DobActor | null; byRole: string | null };

/** "1 May 2012" (no age) of a "YYYY-MM-DD" value; "not recorded" for null. */
export function historyDate(value: string | null | undefined): string {
  if (!value) return "not recorded";
  // A "today" before any birth date gives no age, so only the calendar date is shown.
  return dateOfBirthText(value, new Date(0));
}

/** "Jane Doe (@jdoe) · Administrator"; the role alone or "Unknown" when the person is not known. */
export function historyActor(e: { by: DobActor | null; byRole: string | null }, roleLabel: (r: string) => string = (r) => r): string {
  const role = e.byRole ? roleLabel(e.byRole) : null;
  const b = e.by;
  const name = b ? [b.firstName, b.lastName].filter(Boolean).join(" ") : "";
  const person = b ? [name, b.username ? `@${b.username}` : ""].filter(Boolean).join(" ") || null : null;
  if (person && role) return `${person} · ${role}`;
  return person ?? role ?? "Unknown";
}

/** The display lines of one history entry. A first-sign-in entry carries no values (none are recorded). */
export function historyLine(e: DateOfBirthHistoryEntry): { title: string; change: string | null; reason: string | null } {
  if (e.kind === "GIVEN_AT_FIRST_SIGN_IN") return { title: "Given by the student at first sign-in", change: null, reason: null };
  return { title: "Corrected by an administrator", change: `${historyDate(e.from)} → ${historyDate(e.to)}`, reason: e.reason || null };
}
