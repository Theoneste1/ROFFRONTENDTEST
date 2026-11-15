/**
 * Student sign-up details (capability `studentRegistrationDetails`): date of birth, the student's
 * phone (optional), a close-family phone (required), the country where the student lives and the
 * home location. In Rwanda the home location is Province → District → Sector from the official list
 * (GET /schools/locations); elsewhere it is free text. The SCHOOL's country is separate
 * (lib/accounts/school-claim.ts). Pure rules, unit-tested in tests/student-details.test.mjs.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { isCountryCode, RWANDA } from "../schools/countries";
import { emptyPlace, placeComplete, setPlaceLevel, type Place, type PlaceLevel } from "../schools/school-cascade";
import { normalisePhone, PHONE_HINT } from "./phone";

/** Allowed age in full years on the day of registration (backend contract). */
export const STUDENT_AGE = { min: 5, max: 30 } as const;

export interface StudentDetailsDraft {
  dateOfBirth: string;
  phone: string;
  guardianPhone: string;
  homeCountry: string;
  /** Rwanda only. */
  home: Place;
  /** Another country only. */
  homeLocation: string;
}

export type StudentDetailsField = "dateOfBirth" | "phone" | "guardianPhone" | "homeCountry" | "homeProvince" | "homeDistrict" | "homeSector" | "homeLocation";

export const emptyStudentDetails = (): StudentDetailsDraft => ({
  dateOfBirth: "",
  phone: "",
  guardianPhone: "",
  homeCountry: RWANDA,
  home: emptyPlace(),
  homeLocation: "",
});

export function studentDetailsSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "studentRegistrationDetails");
}

/** A new home country clears the home location (the Rwandan dropdowns or the free text). */
export function setHomeCountry(d: StudentDetailsDraft, country: string): StudentDetailsDraft {
  return country === d.homeCountry ? d : { ...d, homeCountry: country, home: emptyPlace(), homeLocation: "" };
}

/** A new home province / district / sector: the levels after it start again. */
export function setHomeLevel(d: StudentDetailsDraft, level: PlaceLevel, value: string): StudentDetailsDraft {
  return { ...d, home: setPlaceLevel(d.home, level, value) };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" of a local date. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Full years between a "YYYY-MM-DD" birth date and `today`; null for an invalid or future date. */
export function ageOn(dateOfBirth: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!m) return null;
  const [y, mo, da] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(y, mo - 1, da);
  if (birth.getFullYear() !== y || birth.getMonth() !== mo - 1 || birth.getDate() !== da) return null;
  if (isoDay(birth) > isoDay(today)) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() < mo - 1 || (today.getMonth() === mo - 1 && today.getDate() < da)) age -= 1;
  return age;
}

/** The earliest and latest birth dates the form offers (for the date input's min / max). */
export function birthDateBounds(today: Date): { min: string; max: string } {
  const min = new Date(today.getFullYear() - STUDENT_AGE.max - 1, today.getMonth(), today.getDate() + 1);
  const max = new Date(today.getFullYear() - STUDENT_AGE.min, today.getMonth(), today.getDate());
  return { min: isoDay(min), max: isoDay(max) };
}

export function validateStudentDetails(d: StudentDetailsDraft, today: Date = new Date()): Partial<Record<StudentDetailsField, string>> {
  const e: Partial<Record<StudentDetailsField, string>> = {};
  if (!d.dateOfBirth) e.dateOfBirth = "Enter your date of birth.";
  else {
    const age = ageOn(d.dateOfBirth, today);
    if (age === null) e.dateOfBirth = "Enter a valid date of birth.";
    else if (age < STUDENT_AGE.min || age > STUDENT_AGE.max) e.dateOfBirth = `Students must be ${STUDENT_AGE.min} to ${STUDENT_AGE.max} years old. Check your date of birth.`;
  }
  if (d.phone.trim() && !normalisePhone(d.phone)) e.phone = `Enter a valid phone number, or leave it empty. ${PHONE_HINT}`;
  if (!d.guardianPhone.trim()) e.guardianPhone = "Enter the phone number of a parent or close family member.";
  else if (!normalisePhone(d.guardianPhone)) e.guardianPhone = `Enter a valid phone number. ${PHONE_HINT}`;
  if (!isCountryCode(d.homeCountry)) e.homeCountry = "Choose the country where you live.";
  else if (d.homeCountry === RWANDA) {
    if (!d.home.province) e.homeProvince = "Choose your home province.";
    else if (!d.home.district) e.homeDistrict = "Choose your home district.";
    else if (!d.home.sector) e.homeSector = "Choose your home sector.";
  } else {
    const n = d.homeLocation.trim().length;
    if (n < 2 || n > 200) e.homeLocation = "Enter the city or region where you live (2–200 characters).";
  }
  return e;
}

/** The request fields for a valid draft (call validateStudentDetails first). */
export function studentDetailsPayload(d: StudentDetailsDraft) {
  const phone = d.phone.trim() ? normalisePhone(d.phone) : null;
  const base = {
    dateOfBirth: d.dateOfBirth,
    ...(phone && { phone }),
    guardianPhone: normalisePhone(d.guardianPhone) ?? d.guardianPhone.trim(),
    homeCountry: d.homeCountry,
  };
  return d.homeCountry === RWANDA && placeComplete(d.home)
    ? { ...base, homeProvince: d.home.province, homeDistrict: d.home.district, homeSector: d.home.sector }
    : { ...base, homeLocation: d.homeLocation.trim() };
}

/** "Gitega, Nyarugenge, Kigali City" from a profile's Rwandan home place; "" when it has none. */
export function homePlaceText(u: { homeProvince?: string | null; homeDistrict?: string | null; homeSector?: string | null }): string {
  return u.homeSector && u.homeDistrict ? [u.homeSector, u.homeDistrict, u.homeProvince].filter(Boolean).join(", ") : "";
}

/** Request field names (validation messages start with them) → form fields. */
export const STUDENT_DETAILS_SERVER_FIELDS: readonly StudentDetailsField[] = [
  "dateOfBirth", "phone", "guardianPhone", "homeCountry", "homeProvince", "homeDistrict", "homeSector", "homeLocation",
];

/** Backend error codes about these details: the message and the field it belongs beside. */
export const STUDENT_DETAILS_ERRORS: Readonly<Record<string, { field: StudentDetailsField; message: string }>> = {
  UNKNOWN_HOME_LOCATION: { field: "homeSector", message: "That province, district and sector don't match the official list. Choose them again." },
  HOME_LOCATION_RWANDA_ONLY: { field: "homeCountry", message: "Province, district and sector are for homes in Rwanda. For another country, enter your city or region." },
  INVALID_PHONE: { field: "guardianPhone", message: `That phone number isn't valid. ${PHONE_HINT}` },
};
