/**
 * The steps of the three registration forms (app/components/forms/FormWizard). Each form is cut into parts (a field, or
 * fields always shown together) carrying the error keys of their fields — the keys the forms' own validation and server
 * error mapping use, so a failed check or a refused field opens the step that shows it. The parts are grouped into steps
 * twice: "wide" (more than 640px, two columns) and "narrow" (phones, one column, more and smaller steps), so that every
 * step fits the window without scrolling. Unit-tested in tests/form-wizard.test.mjs (every key those rules can produce
 * belongs to exactly one step of each layout).
 */
import { buildSteps, type StepPlan, type WizardLayout, type WizardPart, type WizardPartStep } from "./wizard";

/** A step of a registration form: its title, optional explanation, parts and their error keys. */
export type RegistrationStep = WizardPartStep;

const part = (id: string, fields: readonly string[] = [id], wide = false): WizardPart => (wide ? { id, fields, wide } : { id, fields });

// ─── Student ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Student registration (app/(auth)/register/RegisterForm): the form's fields (the legacy school and home fields too), the
 * school claim (lib/accounts/school-claim), the personal details (lib/accounts/student-details) and the picture.
 * `schoolName` is one part: the legacy school field, the name of a school abroad or of a school that is not listed.
 */
export const STUDENT_PARTS: readonly WizardPart[] = [
  part("firstName"),
  part("lastName"),
  part("dateOfBirth"),
  part("homeCountry"),
  part("phone"),
  part("guardianPhone"),
  part("picture", ["picture"], true),
  part("gradeLevel"),
  part("olympiadInterests", ["olympiadInterests"], true),
  part("schoolCountry", ["country"]),
  part("schoolProvince", ["province"]),
  part("schoolDistrict", ["district"]),
  part("schoolSector", ["sector"]),
  part("school", ["school"], true),
  part("schoolName"),
  part("schoolLocation"),
  part("schoolNote", [], true),
  part("homeProvince"),
  part("homeDistrict"),
  part("homeSector"),
  part("homeLocation", ["homeLocation"], true),
  part("username"),
  part("email"),
  part("password"),
  part("confirm"),
];

const STUDENT_PLANS: Record<WizardLayout, readonly StepPlan[]> = {
  wide: [
    { id: "about", title: "About you", parts: ["firstName", "lastName", "dateOfBirth", "homeCountry"] },
    { id: "contact", title: "Phone and picture", parts: ["phone", "guardianPhone", "picture"] },
    { id: "studies", title: "Your studies", parts: ["gradeLevel", "olympiadInterests"] },
    { id: "school-place", title: "School location", parts: ["schoolCountry", "schoolProvince", "schoolDistrict", "schoolSector"] },
    { id: "school", title: "Your school", parts: ["school", "schoolName", "schoolLocation", "schoolNote"] },
    { id: "home", title: "Where you live", parts: ["homeProvince", "homeDistrict", "homeSector", "homeLocation"] },
    { id: "account", title: "Your account", parts: ["username", "email", "password", "confirm"] },
  ],
  narrow: [
    { id: "about", title: "About you", parts: ["firstName", "lastName"] },
    { id: "birth", title: "Birth and country", parts: ["dateOfBirth", "homeCountry"] },
    { id: "phones", title: "Phone numbers", parts: ["phone", "guardianPhone"] },
    { id: "picture", title: "Profile picture", parts: ["picture"] },
    { id: "studies", title: "Your studies", parts: ["gradeLevel", "olympiadInterests"] },
    { id: "school-place", title: "School location", parts: ["schoolCountry", "schoolProvince"] },
    { id: "school-area", title: "School district and sector", parts: ["schoolDistrict", "schoolSector"] },
    { id: "school", title: "Your school", parts: ["school", "schoolName", "schoolLocation", "schoolNote"] },
    { id: "home", title: "Where you live", parts: ["homeProvince", "homeDistrict", "homeSector", "homeLocation"] },
    { id: "login", title: "Your account", parts: ["username", "email"] },
    { id: "account", title: "Your password", parts: ["password", "confirm"] },
  ],
};

/** The student's steps in one layout; `present` says which parts the form shows (capabilities, school mode, country). */
export function studentSteps(layout: WizardLayout, present?: (part: string) => boolean): readonly RegistrationStep[] {
  return buildSteps(STUDENT_PARTS, STUDENT_PLANS[layout], present);
}

// ─── Teacher ────────────────────────────────────────────────────────────────────────────────────────────────────────

const SCHOOL_TEXT = "The school where you teach, from the official list of Rwandan schools.";

/** Teacher application (app/(auth)/register/teacher/TeacherRegisterForm): TeacherField, the extra details and the picture. */
export const TEACHER_PARTS: readonly WizardPart[] = [
  part("firstName"),
  part("lastName"),
  part("email"),
  part("phone"),
  part("country"),
  part("position"),
  part("yearsOfExperience"),
  part("interests", ["interests"], true),
  part("picture", ["picture"], true),
  part("schoolCountry", []),
  part("schoolProvince"),
  part("schoolDistrict"),
  part("schoolSector"),
  part("school", ["school"], true),
  part("proposedSchoolName", ["proposedSchoolName"], true),
  part("homeDistrict"),
  part("homeSector"),
  part("username"),
  part("password"),
  part("confirm"),
];

const TEACHER_PLANS: Record<WizardLayout, readonly StepPlan[]> = {
  wide: [
    { id: "about", title: "About you", parts: ["firstName", "lastName", "email", "phone", "country"] },
    { id: "teaching", title: "Your teaching", parts: ["position", "yearsOfExperience", "interests", "picture"] },
    { id: "school-place", title: "School location", description: SCHOOL_TEXT, parts: ["schoolCountry", "schoolProvince", "schoolDistrict", "schoolSector"] },
    { id: "school", title: "Your school", description: SCHOOL_TEXT, parts: ["school", "proposedSchoolName"] },
    { id: "home", title: "Home location", description: "Where you live (separate from your school).", parts: ["homeDistrict", "homeSector"] },
    { id: "account", title: "Your account", parts: ["username", "password", "confirm"] },
  ],
  narrow: [
    { id: "about", title: "About you", parts: ["firstName", "lastName"] },
    { id: "contact", title: "Contact details", parts: ["email", "phone"] },
    { id: "country", title: "Country", parts: ["country"] },
    { id: "teaching", title: "Your teaching", parts: ["position", "yearsOfExperience"] },
    { id: "interests", title: "Olympiad interests", parts: ["interests"] },
    { id: "picture", title: "Profile picture", parts: ["picture"] },
    { id: "school-place", title: "School location", description: SCHOOL_TEXT, parts: ["schoolCountry", "schoolProvince"] },
    { id: "school-area", title: "School district and sector", parts: ["schoolDistrict", "schoolSector"] },
    { id: "school", title: "Your school", description: SCHOOL_TEXT, parts: ["school"] },
    // Only when the school is not listed.
    { id: "school-name", title: "School name", parts: ["proposedSchoolName"] },
    { id: "home", title: "Home location", description: "Where you live (separate from your school).", parts: ["homeDistrict", "homeSector"] },
    { id: "login", title: "Your username", parts: ["username"] },
    { id: "account", title: "Your password", parts: ["password", "confirm"] },
  ],
};

/** The teacher's steps in one layout; `present` says which parts the form shows (extra details, picture, school mode). */
export function teacherSteps(layout: WizardLayout, present?: (part: string) => boolean): readonly RegistrationStep[] {
  return buildSteps(TEACHER_PARTS, TEACHER_PLANS[layout], present);
}

// ─── Coach ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Coach application (app/(auth)/apply/ApplyForm): the account, the coach application details, the extra details and the picture. */
export const COACH_PARTS: readonly WizardPart[] = [
  part("firstName"),
  part("lastName"),
  part("country"),
  part("phone"),
  part("picture", ["picture"], true),
  part("occupation"),
  part("educationLevel"),
  part("affiliation"),
  part("yearsOfExperience"),
  part("olympiadInterests", ["olympiadInterests"], true),
  part("expertise", ["expertise"], true),
  part("relevantExperience", ["relevantExperience"], true),
  part("username"),
  part("email"),
  part("password"),
  part("confirm"),
];

/** The parts shown only on a backend with `coachApplicationDetails` (as before: the details, the extra details and the picture). */
const COACH_DETAIL_PARTS = new Set(["country", "occupation", "educationLevel", "olympiadInterests", "phone", "affiliation", "expertise", "relevantExperience", "yearsOfExperience", "picture"]);

const COACH_PLANS: Record<WizardLayout, readonly StepPlan[]> = {
  wide: [
    { id: "about", title: "About you", parts: ["firstName", "lastName", "country", "phone", "picture"] },
    { id: "background", title: "Your background", parts: ["occupation", "educationLevel", "affiliation", "yearsOfExperience", "olympiadInterests"] },
    { id: "experience", title: "Your experience", parts: ["expertise", "relevantExperience"] },
    { id: "account", title: "Your account", parts: ["username", "email", "password", "confirm"] },
  ],
  narrow: [
    { id: "about", title: "About you", parts: ["firstName", "lastName"] },
    { id: "contact", title: "Country and phone", parts: ["country", "phone"] },
    { id: "picture", title: "Profile picture", parts: ["picture"] },
    { id: "background", title: "Your background", parts: ["occupation", "educationLevel"] },
    { id: "affiliation", title: "Affiliation", parts: ["affiliation", "yearsOfExperience"] },
    { id: "interests", title: "Olympiad subjects", parts: ["olympiadInterests"] },
    { id: "expertise", title: "Your expertise", parts: ["expertise"] },
    { id: "experience", title: "Your experience", parts: ["relevantExperience"] },
    { id: "login", title: "Your account", parts: ["username", "email"] },
    { id: "account", title: "Your password", parts: ["password", "confirm"] },
  ],
};

/**
 * The coach's steps in one layout. Without `detailsOn` (no `coachApplicationDetails`) only the name and the account, as
 * before; `present` says which other parts the form shows (extra details, picture).
 */
export function coachSteps(layout: WizardLayout, detailsOn: boolean, present?: (part: string) => boolean): readonly RegistrationStep[] {
  return buildSteps(COACH_PARTS, COACH_PLANS[layout], (p) => (detailsOn || !COACH_DETAIL_PARTS.has(p)) && (present ? present(p) : true));
}
