/**
 * Coach application details (capability `coachApplicationDetails`, POST /mentor-requests): country,
 * current or recent occupation, education level and Olympiad interests. An application never grants
 * an account or permissions: an administrator approves or rejects it. No passport or national ID is
 * asked (owner decision). Pure rules, unit-tested in tests/coach-application.test.mjs.
 *
 * Subjects (owner decision 2026-11-19, capability `coachOlympiadInterests`): "Which subjects are you interested in
 * coaching?" — at least one, at registration, on the coach's profile and when an Administrator edits a coach. The same
 * `olympiadInterests` values; information only (never grants marking or any permission). A coach without any shows
 * "Not set"; nothing is filled in for them.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { countryName, isCountryCode, RWANDA } from "../schools/countries";
import { interestsWithOtherText, otherInterestField, validateInterestsWithOther, type OlympiadSubject } from "./olympiad-interests";

export const EDUCATION_LEVELS = [
  { value: "SECONDARY", label: "Secondary school" },
  { value: "DIPLOMA", label: "Diploma" },
  { value: "BACHELOR", label: "Bachelor's degree" },
  { value: "MASTER", label: "Master's degree" },
  { value: "DOCTORATE", label: "Doctorate (PhD)" },
  { value: "OTHER", label: "Other" },
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number]["value"];

export const educationLabel = (v: string | null | undefined) => EDUCATION_LEVELS.find((e) => e.value === v)?.label ?? (v || "—");

export const COACH_RULES = { occupationMin: 2, occupationMax: 200 } as const;

export interface CoachDetailsDraft {
  country: string;
  occupation: string;
  educationLevel: EducationLevel | "";
  interests: OlympiadSubject[];
  /** "Other" Olympiad: null while not ticked (always on backends without olympiadInterestOther). */
  interestOther: string | null;
}

export type CoachDetailsField = "country" | "occupation" | "educationLevel" | "olympiadInterests";

export const emptyCoachDetails = (): CoachDetailsDraft => ({ country: RWANDA, occupation: "", educationLevel: "", interests: [], interestOther: null });

export function coachDetailsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "coachApplicationDetails");
}

/** The question asked of coaches about their subjects (registration, profile, administrators' edit). */
export const COACH_SUBJECTS_LABEL = "Which subjects are you interested in coaching?";
export const COACH_SUBJECTS_REQUIRED = "Please choose at least one subject";
/** Shown for a coach who has not chosen any subject (existing coaches): never filled in automatically. */
export const COACH_SUBJECTS_NOT_SET = "Not set";

/** The backend lets coaches and administrators view and edit a coach's subjects. */
export function coachInterestsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "coachOlympiadInterests");
}

/** The error to show, or undefined when at least one subject is chosen. */
/**
 * Whether the signed-in user may edit a Coach's subjects: PATCH /admin/users/:id needs users.manage AND
 * users.manageCoaches. GET /me/permissions keeps the frozen original list for an Administrator, which never names
 * users.manageCoaches although every Administrator holds it by default; an individual DENY override on it (listed in
 * `overrides`) removes it. So: listed → yes; otherwise an Administrator with users.manage → yes unless such a DENY is
 * active. Nothing is granted here: the backend decides, this only avoids offering a button that would be refused.
 */
export function canEditCoachSubjects(me: {
  role: string | null | undefined;
  can: (permission: "users.manage" | "users.manageCoaches") => boolean;
  overrides: readonly { permission: string; effect: string }[];
}): boolean {
  if (!me.can("users.manage")) return false;
  if (me.can("users.manageCoaches")) return true;
  return me.role === "ADMIN" && !me.overrides.some((o) => o.permission === "users.manageCoaches" && o.effect === "DENY");
}

export function validateCoachSubjects(interests: readonly OlympiadSubject[]): string | undefined {
  return interests.length === 0 ? COACH_SUBJECTS_REQUIRED : undefined;
}

/** "Mathematics, Physics", or "Not set" for a coach without subjects. */
export function coachSubjectsText(values: readonly string[] | null | undefined, other?: string | null): string {
  return interestsWithOtherText(values, other) || COACH_SUBJECTS_NOT_SET;
}

export function validateCoachDetails(d: CoachDetailsDraft): Partial<Record<CoachDetailsField, string>> {
  const e: Partial<Record<CoachDetailsField, string>> = {};
  if (!isCountryCode(d.country)) e.country = "Choose your country.";
  const n = d.occupation.trim().length;
  if (n < COACH_RULES.occupationMin || n > COACH_RULES.occupationMax) e.occupation = n === 0 ? "Choose your current or most recent occupation (or choose Other and type it)." : "Type your occupation (2–200 characters).";
  if (!EDUCATION_LEVELS.some((l) => l.value === d.educationLevel)) e.educationLevel = "Choose your highest level of education.";
  const i = validateInterestsWithOther(d.interests, d.interestOther, COACH_SUBJECTS_REQUIRED);
  if (i) e.olympiadInterests = i;
  return e;
}

/** The request fields for a valid draft (call validateCoachDetails first). */
export function coachDetailsPayload(d: CoachDetailsDraft) {
  return { country: d.country, occupation: d.occupation.trim(), educationLevel: d.educationLevel as EducationLevel, olympiadInterests: [...d.interests], ...otherInterestField(d.interestOther) };
}

/** One line for the administrators' list: "Kenya · Engineer · Bachelor's degree · Mathematics, Physics" ("" when none). */
export function coachDetailsText(r: { country?: string | null; occupation?: string | null; educationLevel?: string | null; olympiadInterests?: readonly string[] | null; olympiadInterestOther?: string | null }): string {
  return [
    r.country ? countryName(r.country) : "",
    r.occupation ?? "",
    r.educationLevel ? educationLabel(r.educationLevel) : "",
    interestsWithOtherText(r.olympiadInterests, r.olympiadInterestOther),
  ]
    .filter(Boolean)
    .join(" · ");
}
