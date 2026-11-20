/**
 * Teacher self-registration: the form's pure logic (unit-tested in
 * tests/teacher-registration.test.mjs). The API contract is in lib/api/teacher-registration.ts.
 *
 * - Gate: the backend must advertise `teacherSelfRegistration` AND
 *   GET /auth/register/teacher/availability must answer `open: true`.
 * - School: a listed school (chosen province → district → sector → school, plain dropdowns, from GET /schools/search) sends
 *   only `schoolId` + province + district — never its code, sector or name (the backend reads
 *   them). "My school is not listed" sends the proposed name + province / district / sector; an
 *   Administrator reviews it and no school is created automatically.
 * - Home location: district → sector (all districts of every province), separate from the school.
 * - Phone: required; checked with the same rules as the backend's normalisePhone (E.164).
 */
import type { FormGate } from "../forms/closed-form";
import type { DirectorySchool, SchoolProvince } from "../api/accounts";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { OlympiadSubject, TeacherRegistrationInput } from "../api/teacher-registration";
import { normalisePhone, PHONE_HINT } from "./phone";
import { RWANDA as DEFAULT_COUNTRY } from "../schools/countries";

// ─── Subjects ───────────────────────────────────────────────────────────────

export const OLYMPIAD_SUBJECTS: readonly { value: OlympiadSubject; label: string }[] = [
  { value: "MATHEMATICS", label: "Mathematics" },
  { value: "COMPUTING", label: "Computing" },
  { value: "PHYSICS", label: "Physics" },
];

/** "Mathematics" for MATHEMATICS; an unknown value is shown as is. */
export function subjectLabel(value: string): string {
  return OLYMPIAD_SUBJECTS.find((s) => s.value === value)?.label ?? value;
}

/** Adds or removes a subject; the result keeps the official order and has no duplicates. */
export function toggleInterest(interests: readonly OlympiadSubject[], subject: OlympiadSubject): OlympiadSubject[] {
  const on = interests.includes(subject);
  return OLYMPIAD_SUBJECTS.map((s) => s.value).filter((v) => (v === subject ? !on : interests.includes(v)));
}

// ─── Gate ───────────────────────────────────────────────────────────────────

export type TeacherRegistrationGate =
  /** GET /api/v1 has not answered yet. */
  | { state: "loading" }
  /** GET /api/v1 failed (UNKNOWN): retry. */
  | { state: "detectionFailed" }
  /** Not on this backend (LEGACY, or NEW without the feature), or closed by the administrators. */
  | { state: "unavailable" }
  | { state: "availabilityLoading" }
  | { state: "availabilityError" }
  | { state: "open" };

export function teacherRegistrationGate(
  detection: BackendDetection | undefined,
  availability: { status: "pending" | "error" | "success"; open?: boolean },
): TeacherRegistrationGate {
  if (!detection) return { state: "loading" };
  if (detection.state === "UNKNOWN") return { state: "detectionFailed" };
  if (!hasFeature(detection, "teacherSelfRegistration")) return { state: "unavailable" };
  if (availability.status === "pending") return { state: "availabilityLoading" };
  if (availability.status === "error") return { state: "availabilityError" };
  return availability.open === true ? { state: "open" } : { state: "unavailable" };
}

/**
 * What the teacher page shows: the registration gate above combined with the form's availability (formGate).
 * The open form needs BOTH an open gate and a form that is open (or a backend without formAvailability); a closed
 * form shows the administrators' notice; the page waits while the form lookup is in flight; a failed lookup offers a
 * retry instead of assuming the form is open. When the gate is unavailable anyway, a failed lookup just keeps the
 * generic "not available" text.
 */
export type TeacherPage = "loading" | "detectionFailed" | "availabilityError" | "formFailed" | "unavailable" | "open";

export function teacherPage(gate: TeacherRegistrationGate["state"], form: FormGate): TeacherPage {
  if (gate === "loading" || gate === "availabilityLoading") return "loading";
  if (gate === "detectionFailed" || gate === "availabilityError") return gate;
  if (form === "loading") return "loading";
  if (form === "closed") return "unavailable";
  if (gate === "open") return form === "failed" ? "formFailed" : "open";
  return "unavailable";
}

// ─── Phone and countries (shared: lib/accounts/phone.ts, lib/schools/countries.ts) ───

export { normalisePhone, PHONE_HINT } from "./phone";
export { COUNTRY_CODES, countryName, countryOptions, RWANDA as DEFAULT_COUNTRY } from "../schools/countries";

// ─── Places and schools ─────────────────────────────────────────────────────

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const sortNames = (names: Iterable<string>) => [...new Set(names)].sort((a, b) => collator.compare(a, b));

export function provincesOf(locations: readonly SchoolProvince[] | undefined): string[] {
  return sortNames((locations ?? []).map((p) => p.province));
}

/** The districts of one province, sorted. */
export function districtsOf(locations: readonly SchoolProvince[] | undefined, province: string): string[] {
  return sortNames((locations ?? []).find((p) => p.province === province)?.districts.map((d) => d.district) ?? []);
}

/** The sectors of one district of one province, sorted. */
export function sectorsOf(locations: readonly SchoolProvince[] | undefined, province: string, district: string): string[] {
  const d = (locations ?? []).find((p) => p.province === province)?.districts.find((x) => x.district === district);
  return sortNames(d?.sectors ?? []);
}

/** Home location: every district of every province, sorted. */
export function homeDistrictsOf(locations: readonly SchoolProvince[] | undefined): string[] {
  return sortNames((locations ?? []).flatMap((p) => p.districts.map((d) => d.district)));
}

/** Home location: the sectors of a district, whatever its province, sorted. */
export function homeSectorsOf(locations: readonly SchoolProvince[] | undefined, district: string): string[] {
  return sortNames((locations ?? []).flatMap((p) => p.districts.filter((d) => d.district === district).flatMap((d) => d.sectors)));
}

/** Schools by name (locale-aware, case-insensitive), then by code — whatever order the server used. */
export function sortSchools<T extends Pick<DirectorySchool, "name" | "code">>(schools: readonly T[]): T[] {
  return [...schools].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.code ?? "", b.code ?? ""));
}

/**
 * The school-search parameters for the teacher form (owner decision 2026-11-14): the backend lists
 * only schools a Teacher may choose — an official code, or created and verified by an administrator
 * (chosen by id; a code is never invented). Students' searches send nothing extra.
 */
export function teacherSchoolQuery(teacherEligible: boolean): { teacherEligible?: "true" } {
  return teacherEligible ? { teacherEligible: "true" } : {};
}

// ─── Draft ──────────────────────────────────────────────────────────────────

export type SchoolChoiceMode = "listed" | "missing";

export interface TeacherDraft {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  country: string;
  phone: string;
  interests: OlympiadSubject[];
  schoolProvince: string;
  schoolDistrict: string;
  schoolMode: SchoolChoiceMode;
  /** The chosen listed school (its code and sector are shown, never sent). */
  school: Pick<DirectorySchool, "id" | "name" | "code" | "sector" | "district"> | null;
  proposedSchoolName: string;
  /** The school's sector: chosen before the school (sent only for a missing school). */
  schoolSector: string;
  homeDistrict: string;
  homeSector: string;
  password: string;
  confirm: string;
}

export const emptyTeacherDraft = (): TeacherDraft => ({
  firstName: "",
  lastName: "",
  username: "",
  email: "",
  country: DEFAULT_COUNTRY,
  phone: "",
  interests: [],
  schoolProvince: "",
  schoolDistrict: "",
  schoolMode: "listed",
  school: null,
  proposedSchoolName: "",
  schoolSector: "",
  homeDistrict: "",
  homeSector: "",
  password: "",
  confirm: "",
});

/** A new province: district, sector and school (or a not-listed school's name) start again. */
export function setSchoolProvince(d: TeacherDraft, province: string): TeacherDraft {
  return { ...d, schoolProvince: province, schoolDistrict: "", schoolSector: "", school: null, schoolMode: "listed", proposedSchoolName: "" };
}

/** A new district: sector and school start again. */
export function setSchoolDistrict(d: TeacherDraft, district: string): TeacherDraft {
  return { ...d, schoolDistrict: district, schoolSector: "", school: null, schoolMode: "listed", proposedSchoolName: "" };
}

/** A new sector: the school starts again. */
export function setSchoolSector(d: TeacherDraft, sector: string): TeacherDraft {
  return sector === d.schoolSector ? d : { ...d, schoolSector: sector, school: null, schoolMode: "listed", proposedSchoolName: "" };
}

/** Switching between a listed and a missing school clears the other choice (the place is kept). */
export function setSchoolMode(d: TeacherDraft, mode: SchoolChoiceMode): TeacherDraft {
  return mode === d.schoolMode ? d : { ...d, schoolMode: mode, school: null, proposedSchoolName: mode === "missing" ? d.proposedSchoolName : "" };
}

/** A new home district: the home sector starts again. */
export function setHomeDistrict(d: TeacherDraft, district: string): TeacherDraft {
  return { ...d, homeDistrict: district, homeSector: "" };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export type TeacherField =
  | "firstName"
  | "lastName"
  | "gender"
  | "username"
  | "email"
  | "country"
  | "phone"
  | "interests"
  | "schoolProvince"
  | "schoolDistrict"
  | "school"
  | "proposedSchoolName"
  | "schoolSector"
  | "homeDistrict"
  | "homeSector"
  | "password"
  | "confirm";

export const TEACHER_RULES = {
  nameMax: 100,
  usernamePattern: /^[a-z0-9._-]{3,30}$/,
  emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  countryPattern: /^[A-Z]{2}$/,
  schoolNameMin: 2,
  schoolNameMax: 200,
  passwordMin: 8,
  passwordMax: 100,
};

const PASSWORD_HINT = "At least 8 characters, with at least one letter and one number.";
const strongPassword = (p: string) => p.length >= TEACHER_RULES.passwordMin && p.length <= TEACHER_RULES.passwordMax && /[a-zA-Z]/.test(p) && /[0-9]/.test(p);

/** Field errors, or an empty object when the draft can be sent. */
export function validateTeacherRegistration(d: TeacherDraft): Partial<Record<TeacherField, string>> {
  const e: Partial<Record<TeacherField, string>> = {};
  const first = d.firstName.trim();
  const last = d.lastName.trim();
  if (!first) e.firstName = "Enter your first name.";
  else if (first.length > TEACHER_RULES.nameMax) e.firstName = "At most 100 characters.";
  if (!last) e.lastName = "Enter your last name.";
  else if (last.length > TEACHER_RULES.nameMax) e.lastName = "At most 100 characters.";
  if (!TEACHER_RULES.usernamePattern.test(d.username)) e.username = "3–30 characters: lowercase letters, digits, “.”, “_” or “-”.";
  if (!TEACHER_RULES.emailPattern.test(d.email.trim())) e.email = "Enter a valid e-mail address.";
  if (!TEACHER_RULES.countryPattern.test(d.country.trim().toUpperCase())) e.country = "Choose your country.";
  if (!d.phone.trim()) e.phone = "Enter your phone number.";
  else if (!normalisePhone(d.phone)) e.phone = `Enter a valid phone number. ${PHONE_HINT}`;
  if (d.interests.length === 0) e.interests = "Choose at least one Olympiad subject.";
  if (!d.schoolProvince) e.schoolProvince = "Choose your school's province.";
  if (!d.schoolDistrict) e.schoolDistrict = "Choose your school's district.";
  if (!d.schoolSector) e.schoolSector = "Choose your school's sector.";
  if (d.schoolMode === "listed") {
    if (!d.school) e.school = "Choose your school, or “My school is not listed”.";
  } else {
    const n = d.proposedSchoolName.trim().length;
    if (n < TEACHER_RULES.schoolNameMin || n > TEACHER_RULES.schoolNameMax) e.proposedSchoolName = "Enter your school's name (2–200 characters).";
  }
  if (!d.homeDistrict) e.homeDistrict = "Choose the district where you live.";
  if (!d.homeSector) e.homeSector = "Choose the sector where you live.";
  if (!strongPassword(d.password)) e.password = PASSWORD_HINT;
  if (d.confirm !== d.password) e.confirm = "The passwords don't match.";
  return e;
}

/** The request body for a valid draft (call validateTeacherRegistration first). */
export function buildTeacherPayload(d: TeacherDraft): TeacherRegistrationInput {
  const base = {
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    username: d.username.trim().toLowerCase(),
    email: d.email.trim().toLowerCase(),
    password: d.password,
    confirmPassword: d.confirm,
    country: d.country.trim().toUpperCase(),
    phone: normalisePhone(d.phone) ?? d.phone.trim(),
    olympiadInterests: OLYMPIAD_SUBJECTS.map((s) => s.value).filter((v) => d.interests.includes(v)),
    schoolProvince: d.schoolProvince,
    schoolDistrict: d.schoolDistrict,
    homeDistrict: d.homeDistrict,
    homeSector: d.homeSector,
  };
  if (d.schoolMode === "listed") return { ...base, schoolId: d.school!.id };
  return { ...base, proposedSchoolName: d.proposedSchoolName.trim(), schoolSector: d.schoolSector };
}

// ─── Backend errors ─────────────────────────────────────────────────────────

/** Messages for the backend's error codes (POST /auth/register/teacher). */
export const TEACHER_REGISTER_ERRORS: Readonly<Record<string, string>> = {
  REGISTRATION_CLOSED: "Teacher registration is closed at the moment. Please try again later or contact us.",
  IDENTITY_TAKEN: "That username or e-mail is already in use or has a pending application. Try another, or sign in if you already have an account.",
  PASSWORD_MISMATCH: "The passwords don't match.",
  INVALID_PHONE: `That phone number isn't valid. ${PHONE_HINT}`,
  UNKNOWN_SCHOOL: "That school isn't in the directory any more. Choose your school again.",
  SCHOOL_LOCATION_MISMATCH: "That school isn't in the province and district you chose. Choose them again.",
  UNKNOWN_SCHOOL_LOCATION: "That province, district and sector don't match the official list. Choose them again.",
  UNKNOWN_HOME_LOCATION: "That home district and sector don't match the official list. Choose them again.",
  SCHOOL_CHOICE_REQUIRED: "Choose your school, or choose “My school is not listed” and enter its name.",
};

/** The form field a backend error code points at. */
export const TEACHER_ERROR_FIELDS: Readonly<Record<string, TeacherField>> = {
  PASSWORD_MISMATCH: "confirm",
  INVALID_PHONE: "phone",
  UNKNOWN_SCHOOL: "school",
  SCHOOL_LOCATION_MISMATCH: "school",
  UNKNOWN_SCHOOL_LOCATION: "schoolSector",
  UNKNOWN_HOME_LOCATION: "homeSector",
  SCHOOL_CHOICE_REQUIRED: "school",
};

/** Request field names (validation messages start with them) → the form field. */
export const TEACHER_SERVER_FIELDS: Readonly<Record<string, TeacherField>> = {
  firstName: "firstName",
  lastName: "lastName",
  gender: "gender",
  username: "username",
  email: "email",
  confirmPassword: "confirm",
  password: "password",
  country: "country",
  phone: "phone",
  olympiadInterests: "interests",
  schoolProvince: "schoolProvince",
  schoolDistrict: "schoolDistrict",
  schoolId: "school",
  proposedSchoolName: "proposedSchoolName",
  schoolSector: "schoolSector",
  homeDistrict: "homeDistrict",
  homeSector: "homeSector",
};

/** Server validation messages ("phone must be …") grouped by form field (first message wins). */
export function mapServerFieldErrors(messages: readonly string[]): Partial<Record<TeacherField, string>> {
  const out: Partial<Record<TeacherField, string>> = {};
  const names = Object.keys(TEACHER_SERVER_FIELDS);
  for (const msg of messages) {
    const name = names.find((f) => msg === f || msg.startsWith(f + " "));
    const field = name ? TEACHER_SERVER_FIELDS[name] : undefined;
    if (field && !out[field]) out[field] = msg;
  }
  return out;
}
