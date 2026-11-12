/**
 * How a student names their school, in the three shapes the backend accepts
 * (backend develop 9fd1942: register-student.dto.ts and school-affiliation.dto.ts):
 *
 *   directory   a school from GET /schools/search  → { schoolCode }   (6 digits)
 *   notListed   a Rwandan school that isn't listed → { schoolName, schoolProvince, schoolDistrict, schoolSector }
 *               (place values from GET /schools/locations)
 *   abroad      a school in another country        → { country, schoolName } (ISO 3166-1 alpha-2, not RW)
 *
 * Every claim starts PENDING until an Administrator verifies it; the backend
 * decides whether and how a school is linked.
 */
import type { DirectorySchool, SchoolClaimInput } from "../api/accounts";

export type SchoolClaimDraft =
  | { mode: "directory"; school: Pick<DirectorySchool, "code" | "name"> | null }
  | { mode: "notListed"; name: string; province: string; district: string; sector: string }
  | { mode: "abroad"; country: string; name: string };

export type SchoolClaimField = "school" | "schoolName" | "province" | "district" | "sector" | "country";

export const SCHOOL_CLAIM_RULES = { nameMin: 2, nameMax: 200, placeMax: 100, codePattern: /^\d{6}$/, countryPattern: /^[A-Z]{2}$/ };

/** Field errors, or an empty object when the draft can be sent. */
export function validateSchoolClaim(d: SchoolClaimDraft): Partial<Record<SchoolClaimField, string>> {
  const e: Partial<Record<SchoolClaimField, string>> = {};
  const nameOk = (n: string) => n.trim().length >= SCHOOL_CLAIM_RULES.nameMin && n.trim().length <= SCHOOL_CLAIM_RULES.nameMax;
  if (d.mode === "directory") {
    if (!d.school || !SCHOOL_CLAIM_RULES.codePattern.test(d.school.code)) e.school = "Search for your school and choose it from the list.";
  } else if (d.mode === "notListed") {
    if (!nameOk(d.name)) e.schoolName = "Enter your school's name (2–200 characters).";
    if (!d.province) e.province = "Choose the province.";
    if (!d.district) e.district = "Choose the district.";
    if (!d.sector) e.sector = "Choose the sector.";
  } else {
    const c = d.country.trim().toUpperCase();
    if (!SCHOOL_CLAIM_RULES.countryPattern.test(c)) e.country = "Enter the two-letter country code (for example KE or UG).";
    else if (c === "RW") e.country = "For a school in Rwanda, search the directory or choose “My school is not listed”.";
    if (!nameOk(d.name)) e.schoolName = "Enter your school's name (2–200 characters).";
  }
  return e;
}

/** The request fields for a valid draft (call validateSchoolClaim first). */
export function schoolClaimPayload(d: SchoolClaimDraft): SchoolClaimInput {
  if (d.mode === "directory") return { schoolCode: d.school!.code };
  if (d.mode === "notListed") {
    return { schoolName: d.name.trim(), schoolProvince: d.province, schoolDistrict: d.district, schoolSector: d.sector };
  }
  return { country: d.country.trim().toUpperCase(), schoolName: d.name.trim() };
}

/** Backend error fields → the draft field they belong to (for showing server field errors). */
export const SCHOOL_CLAIM_SERVER_FIELDS: Readonly<Record<string, SchoolClaimField>> = {
  schoolCode: "school",
  schoolName: "schoolName",
  schoolProvince: "province",
  schoolDistrict: "district",
  schoolSector: "sector",
  country: "country",
};

/** Messages for the backend's school-claim error codes (registration and /me/school-affiliation). */
export const SCHOOL_CLAIM_ERRORS: Readonly<Record<string, string>> = {
  UNKNOWN_SCHOOL_CODE: "That school isn't in the directory any more. Search again and choose it from the list.",
  SCHOOL_INACTIVE: "That school is no longer active on ROF LMS. Choose another school or contact us.",
  UNKNOWN_SCHOOL_LOCATION: "That province, district and sector don't match the official list. Choose them again.",
  SCHOOL_CODE_RWANDA_ONLY: "School codes are only for schools in Rwanda.",
  SCHOOL_DIRECTORY_RWANDA_ONLY: "Province, district and sector are only for schools in Rwanda.",
  INVALID_SCHOOL_NAME: "Enter the school's name as it is written.",
  CLAIM_ALREADY_PENDING: "Your school is already waiting for verification.",
  ALREADY_VERIFIED: "This school is already verified for your account.",
  CLAIM_LIMIT_REACHED: "You have changed your school too many times today. Try again later.",
  CLAIM_COOLDOWN: "This school was recently declined for your account. You can ask again later.",
};

/** "Kenya (KE)" for a valid code where the browser knows the name; otherwise the code. */
export function countryLabel(code: string): string {
  const c = code.trim().toUpperCase();
  if (!SCHOOL_CLAIM_RULES.countryPattern.test(c)) return c;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(c);
    return name && name !== c ? `${name} (${c})` : c;
  } catch {
    return c;
  }
}
