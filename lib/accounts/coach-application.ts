/**
 * Coach application details (capability `coachApplicationDetails`, POST /mentor-requests): country,
 * current or recent occupation, education level and Olympiad interests. An application never grants
 * an account or permissions: an administrator approves or rejects it. No passport or national ID is
 * asked (owner decision). Pure rules, unit-tested in tests/coach-application.test.mjs.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { countryName, isCountryCode, RWANDA } from "../schools/countries";
import { interestsText, validateInterests, type OlympiadSubject } from "./olympiad-interests";

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
}

export type CoachDetailsField = "country" | "occupation" | "educationLevel" | "olympiadInterests";

export const emptyCoachDetails = (): CoachDetailsDraft => ({ country: RWANDA, occupation: "", educationLevel: "", interests: [] });

export function coachDetailsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "coachApplicationDetails");
}

export function validateCoachDetails(d: CoachDetailsDraft): Partial<Record<CoachDetailsField, string>> {
  const e: Partial<Record<CoachDetailsField, string>> = {};
  if (!isCountryCode(d.country)) e.country = "Choose your country.";
  const n = d.occupation.trim().length;
  if (n < COACH_RULES.occupationMin || n > COACH_RULES.occupationMax) e.occupation = "Enter your current or most recent occupation (2–200 characters).";
  if (!EDUCATION_LEVELS.some((l) => l.value === d.educationLevel)) e.educationLevel = "Choose your highest level of education.";
  const i = validateInterests(d.interests);
  if (i) e.olympiadInterests = i;
  return e;
}

/** The request fields for a valid draft (call validateCoachDetails first). */
export function coachDetailsPayload(d: CoachDetailsDraft) {
  return { country: d.country, occupation: d.occupation.trim(), educationLevel: d.educationLevel as EducationLevel, olympiadInterests: [...d.interests] };
}

/** One line for the administrators' list: "Kenya · Engineer · Bachelor's degree · Mathematics, Physics" ("" when none). */
export function coachDetailsText(r: { country?: string | null; occupation?: string | null; educationLevel?: string | null; olympiadInterests?: readonly string[] | null }): string {
  return [
    r.country ? countryName(r.country) : "",
    r.occupation ?? "",
    r.educationLevel ? educationLabel(r.educationLevel) : "",
    r.olympiadInterests?.length ? interestsText(r.olympiadInterests) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
