/**
 * The steps of the three registration forms (app/components/forms/FormWizard): the numbered sections the forms already
 * had, in the same order, each with the error keys of its fields — the keys the forms' own validation and server error
 * mapping use, so a failed check or a refused field opens the right step. Unit-tested in tests/form-wizard.test.mjs
 * (every key those rules can produce belongs to exactly one step).
 */
import type { WizardStepModel } from "./wizard";

/** A step with an optional short explanation under its heading. */
export type RegistrationStep = WizardStepModel & { description?: string };

/**
 * Student registration (app/(auth)/register/RegisterForm): the form's fields (the legacy school and home fields too),
 * the school claim (lib/accounts/school-claim), the personal details (lib/accounts/student-details) and the picture.
 */
export const STUDENT_STEPS: readonly RegistrationStep[] = [
  { id: "about", title: "About you", fields: ["firstName", "lastName", "dateOfBirth", "picture", "homeCountry", "phone", "guardianPhone"] },
  { id: "studies", title: "Your studies", fields: ["gradeLevel", "olympiadInterests"] },
  { id: "school", title: "Your school", fields: ["schoolName", "schoolLocation", "school", "province", "district", "sector", "country"] },
  { id: "home", title: "Where you live", fields: ["homeLocation", "homeProvince", "homeDistrict", "homeSector"] },
  { id: "account", title: "Your account", fields: ["username", "email", "password", "confirm"] },
];

/** Teacher application (app/(auth)/register/teacher/TeacherRegisterForm): TeacherField, the extra details and the picture. */
export const TEACHER_STEPS: readonly RegistrationStep[] = [
  { id: "about", title: "About you", fields: ["firstName", "lastName", "username", "email", "country", "phone", "position", "yearsOfExperience", "picture"] },
  { id: "interests", title: "Olympiad interests", description: "The Olympiad subjects you would like to support. Choose at least one.", fields: ["interests"] },
  {
    id: "school",
    title: "Your school",
    description: "The school where you teach, from the official list of Rwandan schools.",
    fields: ["schoolProvince", "schoolDistrict", "schoolSector", "school", "proposedSchoolName"],
  },
  { id: "home", title: "Home location", description: "Where you live (separate from your school).", fields: ["homeDistrict", "homeSector"] },
  { id: "account", title: "Your account", fields: ["password", "confirm"] },
];

const COACH_ABOUT: RegistrationStep = { id: "about", title: "About you", fields: ["firstName", "lastName", "country"] };
const COACH_BACKGROUND: RegistrationStep = {
  id: "background",
  title: "Your background",
  fields: ["occupation", "educationLevel", "olympiadInterests", "phone", "affiliation", "expertise", "relevantExperience", "yearsOfExperience", "picture"],
};
const COACH_ACCOUNT: RegistrationStep = { id: "account", title: "Your account", fields: ["username", "email", "password", "confirm"] };

/**
 * Coach application (app/(auth)/apply/ApplyForm): "Your background" (the coach application details, the extra details and
 * the picture) only on a backend with `coachApplicationDetails`, as before.
 */
export function coachSteps(detailsOn: boolean): readonly RegistrationStep[] {
  return detailsOn ? [COACH_ABOUT, COACH_BACKGROUND, COACH_ACCOUNT] : [COACH_ABOUT, COACH_ACCOUNT];
}
