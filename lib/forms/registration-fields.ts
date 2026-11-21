/**
 * The fields of the three registration forms (Student, Teacher, Coach), in the order they are shown: ONE continuous form
 * (app/components/forms/SignupForm), no steps and no section headings. Each part is a field (or fields always shown
 * together) carrying the error keys of its fields — the keys the forms' own validation and server error mapping use —
 * so every error the rules or the server can produce has a field to show it on (unit-tested in
 * tests/registration-fields.test.mjs).
 *
 * Layout: two columns above 640px, where fields pair naturally (first / last name, phone / close-family phone, district /
 * sector …), one column on phones. A `wide` part spans both columns (check boxes, text areas, the picture, the school);
 * a `row` part starts a new row, so a field never sits beside one it has nothing to do with.
 */

/** A block of a registration form: one field (or a group shown together) and the error keys it holds. */
export interface SignupPart {
  id: string;
  fields: readonly string[];
  /** Spans both columns of the wide layout. */
  wide?: boolean;
  /** Starts a new row of the wide layout. */
  row?: boolean;
}

const part = (id: string, fields: readonly string[] = [id], layout?: "wide" | "row"): SignupPart =>
  layout === "wide" ? { id, fields, wide: true } : layout === "row" ? { id, fields, row: true } : { id, fields };

/** The parts a form shows, in order (`present`, default all: the backend's capabilities and the person's answers). */
export function visibleParts(parts: readonly SignupPart[], present?: (id: string) => boolean): SignupPart[] {
  return parts.filter((p) => (present ? present(p.id) : true));
}

/** The part holding an error key (undefined when no part has it). */
export function partOfField(parts: readonly SignupPart[], field: string): SignupPart | undefined {
  return parts.find((p) => p.fields.includes(field));
}

// ─── Student ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Student registration (app/(auth)/register/RegisterForm): the form's fields (the legacy school and home fields too), the
 * school claim (lib/accounts/school-claim), the personal details (lib/accounts/student-details) and the picture.
 * `schoolName` is one part: the legacy school field, the name of a school abroad or of a school that is not listed.
 */
export const STUDENT_PARTS: readonly SignupPart[] = [
  part("firstName"),
  part("lastName"),
  part("gender", ["gender"], "row"),
  part("dateOfBirth"),
  part("phone", ["phone"], "row"),
  part("guardianPhone"),
  part("picture", ["picture"], "wide"),
  part("gradeLevel", ["gradeLevel"], "row"),
  part("olympiadInterests", ["olympiadInterests"], "wide"),
  part("schoolCountry", ["country"], "row"),
  part("schoolProvince", ["province"]),
  part("schoolDistrict", ["district"]),
  part("schoolSector", ["sector"]),
  part("school", ["school"], "wide"),
  part("schoolName"),
  part("schoolLocation"),
  part("schoolNote", [], "wide"),
  // Home location (lib/accounts/home-location): Home country, then (Rwanda only) province → district → sector.
  part("homeCountry", ["homeCountry"], "row"),
  part("homeProvince"),
  part("homeDistrict", ["homeDistrict"], "row"),
  part("homeSector"),
  part("homeLocation", ["homeLocation"], "wide"),
  part("username", ["username"], "row"),
  part("email"),
  part("password"),
  part("confirm"),
];

// ─── Teacher ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Teacher application (app/(auth)/register/teacher/TeacherRegisterForm): TeacherField, the extra details and the picture. */
export const TEACHER_PARTS: readonly SignupPart[] = [
  part("firstName"),
  part("lastName"),
  part("gender", ["gender"], "row"),
  part("phone"),
  part("email", ["email"], "row"),
  part("position", ["position"], "row"),
  part("yearsOfExperience"),
  part("interests", ["interests"], "wide"),
  part("picture", ["picture"], "wide"),
  part("schoolCountry", [], "row"),
  part("schoolProvince"),
  part("schoolDistrict"),
  part("schoolSector"),
  part("school", ["school"], "wide"),
  part("proposedSchoolName", ["proposedSchoolName"], "wide"),
  // Home location (lib/accounts/home-location): Home country (`country`), then (Rwanda only) province → district → sector.
  part("country", ["country"], "row"),
  part("homeProvince", ["homeProvince"]),
  part("homeDistrict", ["homeDistrict"], "row"),
  part("homeSector"),
  part("username", ["username"], "row"),
  part("password", ["password"], "row"),
  part("confirm"),
];

// ─── Coach ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Coach application (app/(auth)/apply/ApplyForm): the account, the coach application details, the extra details and the picture. */
export const COACH_PARTS: readonly SignupPart[] = [
  part("firstName"),
  part("lastName"),
  part("gender", ["gender"], "row"),
  part("phone"),
  part("picture", ["picture"], "wide"),
  part("occupation", ["occupation"], "row"),
  part("educationLevel"),
  part("affiliation", ["affiliation"], "row"),
  part("yearsOfExperience"),
  part("olympiadInterests", ["olympiadInterests"], "wide"),
  part("expertise", ["expertise"], "wide"),
  part("relevantExperience", ["relevantExperience"], "wide"),
  // Home location (lib/accounts/home-location): Home country (`country`), then (Rwanda only) province → district → sector.
  part("country", ["country"], "row"),
  part("homeProvince", ["homeProvince"]),
  part("homeDistrict", ["homeDistrict"], "row"),
  part("homeSector"),
  part("username", ["username"], "row"),
  part("email"),
  part("password"),
  part("confirm"),
];

/** The parts shown only on a backend with `coachApplicationDetails` (as before: the details, the extra details and the picture). */
export const COACH_DETAIL_PARTS: ReadonlySet<string> = new Set([
  "country", "occupation", "educationLevel", "olympiadInterests", "phone", "affiliation", "expertise", "relevantExperience", "yearsOfExperience", "picture",
  "homeProvince", "homeDistrict", "homeSector",
]);

/** The coach's parts: without `detailsOn` (no `coachApplicationDetails`) only the name and the account, as before. */
export function coachParts(detailsOn: boolean, present?: (part: string) => boolean): SignupPart[] {
  return visibleParts(COACH_PARTS, (p) => (detailsOn || !COACH_DETAIL_PARTS.has(p)) && (present ? present(p) : true));
}
