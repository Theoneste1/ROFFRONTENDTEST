/**
 * Gender at sign-up (capability registrationGender; owner, 2026-11-20): every registration form — student, teacher,
 * coach — asks it, required. FEMALE or MALE, as the backend accepts. Older backends refuse the field, so it is asked
 * and sent only when the backend advertises the feature.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";

export type Gender = "FEMALE" | "MALE";

export const GENDER_OPTIONS: readonly { value: Gender; label: string }[] = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
];

/** True when the backend requires (and accepts) `gender` on the sign-ups. */
export function genderSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "registrationGender");
}

/** The roles asked their gender once when it is missing (the backend's genderRequired; capability genderStep). */
const GENDER_STEP_ROLES = ["STUDENT", "TEACHER", "MENTOR"];

/** True while the signed-in student, teacher or coach still has to give their gender (older backends never ask). */
export function needsGender(user: { role?: string | null; genderRequired?: boolean } | null | undefined): boolean {
  return !!user && GENDER_STEP_ROLES.includes(user.role ?? "") && user.genderRequired === true;
}

/** The error to show, or undefined when a gender is chosen. */
export function validateGender(value: string): string | undefined {
  return value === "FEMALE" || value === "MALE" ? undefined : "Choose your gender.";
}
