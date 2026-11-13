// Teacher self-registration: gate, subjects, phone, countries, places, school sorting, cascade
// resets, validation, payloads and error mapping (lib/accounts/teacher-registration.ts), and the
// administrator review rules (lib/admin/teacher-applications.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COUNTRY_CODES,
  OLYMPIAD_SUBJECTS,
  TEACHER_ERROR_FIELDS,
  TEACHER_REGISTER_ERRORS,
  buildTeacherPayload,
  countryOptions,
  districtsOf,
  emptyTeacherDraft,
  homeDistrictsOf,
  homeSectorsOf,
  mapServerFieldErrors,
  normalisePhone,
  provincesOf,
  sectorsOf,
  setHomeDistrict,
  setSchoolDistrict,
  setSchoolMode,
  setSchoolProvince,
  sortSchools,
  subjectLabel,
  teacherRegistrationGate,
  toggleInterest,
  validateTeacherRegistration,
} from "../lib/accounts/teacher-registration.ts";
import {
  TEACHER_REVIEW_ERRORS,
  applicationSchoolPlace,
  approvalNeedsSchool,
  approvalPayload,
  rejectionReasonProblem,
  teacherApplicationsNavVisible,
  teacherReviewMode,
} from "../lib/admin/teacher-applications.ts";
import { ADMIN_NAV, ADMIN_TEACHER_APPLICATIONS } from "../lib/auth/navigation.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
const ON = NEW(["teacherSelfRegistration"]);

// ─── Gate ───────────────────────────────────────────────────────────────────

test("gate: waits for the detection; UNKNOWN is a failure to retry", () => {
  assert.deepEqual(teacherRegistrationGate(undefined, { status: "pending" }), { state: "loading" });
  assert.deepEqual(teacherRegistrationGate({ state: "UNKNOWN", reason: "x" }, { status: "pending" }), { state: "detectionFailed" });
});

test("gate: LEGACY or a backend without the feature → unavailable (availability not consulted)", () => {
  assert.deepEqual(teacherRegistrationGate({ state: "LEGACY" }, { status: "success", open: true }), { state: "unavailable" });
  assert.deepEqual(teacherRegistrationGate(NEW(["teacherAccounts"]), { status: "success", open: true }), { state: "unavailable" });
});

test("gate: with the feature, availability decides", () => {
  assert.deepEqual(teacherRegistrationGate(ON, { status: "pending" }), { state: "availabilityLoading" });
  assert.deepEqual(teacherRegistrationGate(ON, { status: "error" }), { state: "availabilityError" });
  assert.deepEqual(teacherRegistrationGate(ON, { status: "success", open: false }), { state: "unavailable" });
  assert.deepEqual(teacherRegistrationGate(ON, { status: "success" }), { state: "unavailable" }, "a missing flag is not open");
  assert.deepEqual(teacherRegistrationGate(ON, { status: "success", open: true }), { state: "open" });
});

// ─── Subjects ───────────────────────────────────────────────────────────────

test("subjects: the three Olympiad subjects with their labels", () => {
  assert.deepEqual(OLYMPIAD_SUBJECTS.map((s) => [s.value, s.label]), [["MATHEMATICS", "Mathematics"], ["COMPUTING", "Computing"], ["PHYSICS", "Physics"]]);
  assert.equal(subjectLabel("PHYSICS"), "Physics");
  assert.equal(subjectLabel("CHEMISTRY"), "CHEMISTRY");
});

test("toggleInterest adds and removes, keeps the official order, never duplicates", () => {
  assert.deepEqual(toggleInterest([], "PHYSICS"), ["PHYSICS"]);
  assert.deepEqual(toggleInterest(["PHYSICS"], "MATHEMATICS"), ["MATHEMATICS", "PHYSICS"]);
  assert.deepEqual(toggleInterest(["MATHEMATICS", "PHYSICS"], "PHYSICS"), ["MATHEMATICS"]);
  assert.deepEqual(toggleInterest(["PHYSICS", "PHYSICS"], "COMPUTING"), ["COMPUTING", "PHYSICS"]);
});

// ─── Phone (mirrors the backend's normalisePhone) ───────────────────────────

test("phone: Rwandan numbers in every common local form become +250…", () => {
  for (const raw of ["0788123456", "078 812 3456", "0788-123-456", "(0788) 123456", "788123456", "250788123456", "+250 788 123 456", "00250788123456"]) {
    assert.equal(normalisePhone(raw), "+250788123456", raw);
  }
  assert.equal(normalisePhone("0252123456"), "+250252123456", "landline");
});

test("phone: other countries in international form; anything else refused", () => {
  assert.equal(normalisePhone("+254 712 345678"), "+254712345678");
  for (const bad of ["", "N/A", "07881234O6", "0588123456", "+25078812345", "12345", "+0123456789", "+2507881234567"]) {
    assert.equal(normalisePhone(bad), null, bad);
  }
});

// ─── Countries ──────────────────────────────────────────────────────────────

test("countries: Rwanda first, every code two letters and unique, the rest by name", () => {
  const opts = countryOptions();
  assert.equal(opts[0].value, "RW");
  assert.equal(opts[0].label, "Rwanda");
  assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length);
  for (const c of COUNTRY_CODES) assert.match(c, /^[A-Z]{2}$/);
  assert.equal(opts.length, COUNTRY_CODES.length);
  const rest = opts.slice(1).map((o) => o.label);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  assert.ok(opts.some((o) => o.value === "KE" && o.label === "Kenya"));
});

// ─── Places ─────────────────────────────────────────────────────────────────

const LOCATIONS = [
  { province: "Southern Province", districts: [{ district: "Huye", sectors: ["Tumba", "Ngoma"] }, { district: "Gisagara", sectors: ["Save"] }] },
  { province: "Kigali City", districts: [{ district: "Gasabo", sectors: ["Remera", "Kacyiru", "Bumbogo"] }, { district: "Kicukiro", sectors: ["Niboye"] }] },
];

test("places: provinces, districts of a province and sectors of a district, sorted", () => {
  assert.deepEqual(provincesOf(LOCATIONS), ["Kigali City", "Southern Province"]);
  assert.deepEqual(districtsOf(LOCATIONS, "Southern Province"), ["Gisagara", "Huye"]);
  assert.deepEqual(districtsOf(LOCATIONS, ""), []);
  assert.deepEqual(districtsOf(undefined, "Kigali City"), []);
  assert.deepEqual(sectorsOf(LOCATIONS, "Kigali City", "Gasabo"), ["Bumbogo", "Kacyiru", "Remera"]);
  assert.deepEqual(sectorsOf(LOCATIONS, "Southern Province", "Gasabo"), [], "district of another province");
});

test("home location: every district of every province, and a district's sectors", () => {
  assert.deepEqual(homeDistrictsOf(LOCATIONS), ["Gasabo", "Gisagara", "Huye", "Kicukiro"]);
  assert.deepEqual(homeSectorsOf(LOCATIONS, "Huye"), ["Ngoma", "Tumba"]);
  assert.deepEqual(homeSectorsOf(LOCATIONS, ""), []);
  assert.deepEqual(homeDistrictsOf(undefined), []);
});

test("schools: sorted by name (case- and accent-insensitive), whatever the server order", () => {
  const s = (name, code) => ({ id: code, code, name, location: "", district: "Huye", sector: "Tumba" });
  const sorted = sortSchools([s("lycée de Butare", "3"), s("GS Zebra", "1"), s("École Ste Bernadette", "2"), s("GS Zebra", "0")]);
  assert.deepEqual(sorted.map((x) => `${x.name}/${x.code}`), ["École Ste Bernadette/2", "GS Zebra/0", "GS Zebra/1", "lycée de Butare/3"]);
});

// ─── Cascade ────────────────────────────────────────────────────────────────

const SCHOOL = { id: "11111111-1111-4111-8111-111111111111", name: "GS Tumba", code: "310001", sector: "Tumba", district: "Huye" };
const filled = (over = {}) => ({
  ...emptyTeacherDraft(),
  firstName: "Aline",
  lastName: "Uwase",
  username: "aline.u",
  email: "Aline@Example.RW",
  country: "RW",
  phone: "0788 123 456",
  interests: ["MATHEMATICS"],
  schoolProvince: "Southern Province",
  schoolDistrict: "Huye",
  school: SCHOOL,
  homeDistrict: "Gasabo",
  homeSector: "Remera",
  password: "secret123",
  confirm: "secret123",
  ...over,
});

test("cascade: a new province resets district, school and school sector", () => {
  const d = setSchoolProvince(filled({ schoolSector: "Tumba" }), "Kigali City");
  assert.equal(d.schoolProvince, "Kigali City");
  assert.equal(d.schoolDistrict, "");
  assert.equal(d.school, null);
  assert.equal(d.schoolSector, "");
  assert.equal(d.homeDistrict, "Gasabo", "home location untouched");
});

test("cascade: a new district resets school and school sector only", () => {
  const d = setSchoolDistrict(filled({ schoolSector: "Tumba" }), "Gisagara");
  assert.equal(d.schoolProvince, "Southern Province");
  assert.equal(d.schoolDistrict, "Gisagara");
  assert.equal(d.school, null);
  assert.equal(d.schoolSector, "");
});

test("cascade: switching listed / missing clears the other choice; home district resets home sector", () => {
  const m = setSchoolMode(filled(), "missing");
  assert.equal(m.schoolMode, "missing");
  assert.equal(m.school, null);
  const back = setSchoolMode({ ...m, proposedSchoolName: "New school", schoolSector: "Tumba" }, "listed");
  assert.equal(back.proposedSchoolName, "");
  assert.equal(back.schoolSector, "");
  const same = filled();
  assert.equal(setSchoolMode(same, "listed"), same);
  const h = setHomeDistrict(filled(), "Huye");
  assert.equal(h.homeDistrict, "Huye");
  assert.equal(h.homeSector, "");
});

// ─── Validation ─────────────────────────────────────────────────────────────

test("validation: a complete listed-school draft passes", () => {
  assert.deepEqual(validateTeacherRegistration(filled()), {});
});

test("validation: an empty draft names every required field", () => {
  const e = validateTeacherRegistration({ ...emptyTeacherDraft(), country: "" });
  assert.deepEqual(Object.keys(e).sort(), [
    "country", "email", "firstName", "homeDistrict", "homeSector", "interests", "lastName", "password", "phone", "school", "schoolDistrict", "schoolProvince", "username",
  ]);
  assert.equal(e.confirm, undefined, "two empty passwords match; the password rule reports it");
});

test("validation: username, e-mail, country, phone and names", () => {
  assert.ok(validateTeacherRegistration(filled({ username: "Al" })).username);
  assert.ok(validateTeacherRegistration(filled({ username: "has space" })).username);
  assert.ok(validateTeacherRegistration(filled({ email: "nope@x" })).email);
  assert.ok(validateTeacherRegistration(filled({ country: "RWA" })).country);
  assert.ok(validateTeacherRegistration(filled({ phone: "12345" })).phone);
  assert.ok(validateTeacherRegistration(filled({ phone: "  " })).phone);
  assert.equal(validateTeacherRegistration(filled({ phone: "+254 712 345678", country: "KE" })).phone, undefined);
  assert.ok(validateTeacherRegistration(filled({ firstName: "   " })).firstName);
  assert.ok(validateTeacherRegistration(filled({ lastName: "x".repeat(101) })).lastName);
});

test("validation: password rule and confirmation", () => {
  assert.ok(validateTeacherRegistration(filled({ password: "short1", confirm: "short1" })).password);
  assert.ok(validateTeacherRegistration(filled({ password: "lettersonly", confirm: "lettersonly" })).password);
  assert.equal(validateTeacherRegistration(filled({ confirm: "secret124" })).confirm, "The passwords don't match.");
});

test("validation: at least one interest", () => {
  assert.ok(validateTeacherRegistration(filled({ interests: [] })).interests);
});

test("validation: a missing school needs its name (2–200) and sector, not a listed school", () => {
  const m = filled({ schoolMode: "missing", school: null, proposedSchoolName: "", schoolSector: "" });
  const e = validateTeacherRegistration(m);
  assert.ok(e.proposedSchoolName && e.schoolSector);
  assert.equal(e.school, undefined);
  assert.ok(validateTeacherRegistration({ ...m, proposedSchoolName: "x", schoolSector: "Tumba" }).proposedSchoolName);
  assert.ok(validateTeacherRegistration({ ...m, proposedSchoolName: "x".repeat(201), schoolSector: "Tumba" }).proposedSchoolName);
  assert.deepEqual(validateTeacherRegistration({ ...m, proposedSchoolName: " GS Nouvelle ", schoolSector: "Tumba" }), {});
});

// ─── Payload ────────────────────────────────────────────────────────────────

test("payload, listed school: schoolId + province + district — never code, sector or name", () => {
  const p = buildTeacherPayload(filled({ interests: ["PHYSICS", "MATHEMATICS"], schoolSector: "stale", proposedSchoolName: "stale" }));
  assert.deepEqual(p, {
    firstName: "Aline",
    lastName: "Uwase",
    username: "aline.u",
    email: "aline@example.rw",
    password: "secret123",
    confirmPassword: "secret123",
    country: "RW",
    phone: "+250788123456",
    olympiadInterests: ["MATHEMATICS", "PHYSICS"],
    schoolProvince: "Southern Province",
    schoolDistrict: "Huye",
    homeDistrict: "Gasabo",
    homeSector: "Remera",
    schoolId: SCHOOL.id,
  });
  for (const k of ["schoolCode", "schoolSector", "schoolName", "proposedSchoolName", "confirm", "interests", "school", "schoolMode"]) assert.ok(!(k in p), k);
});

test("payload, missing school: proposed name + province + district + sector, no schoolId", () => {
  const p = buildTeacherPayload(filled({ schoolMode: "missing", school: null, proposedSchoolName: "  GS Nouvelle ", schoolSector: "Tumba" }));
  assert.equal(p.proposedSchoolName, "GS Nouvelle");
  assert.equal(p.schoolSector, "Tumba");
  assert.equal(p.schoolProvince, "Southern Province");
  assert.equal(p.schoolDistrict, "Huye");
  assert.ok(!("schoolId" in p));
});

// ─── Errors ─────────────────────────────────────────────────────────────────

test("errors: every documented code has a message; field codes point at a form field", () => {
  for (const code of ["REGISTRATION_CLOSED", "IDENTITY_TAKEN", "PASSWORD_MISMATCH", "INVALID_PHONE", "UNKNOWN_SCHOOL", "SCHOOL_LOCATION_MISMATCH", "UNKNOWN_SCHOOL_LOCATION", "UNKNOWN_HOME_LOCATION", "SCHOOL_CHOICE_REQUIRED"]) {
    assert.ok(TEACHER_REGISTER_ERRORS[code], code);
  }
  assert.equal(TEACHER_ERROR_FIELDS.INVALID_PHONE, "phone");
  assert.equal(TEACHER_ERROR_FIELDS.PASSWORD_MISMATCH, "confirm");
  assert.equal(TEACHER_ERROR_FIELDS.UNKNOWN_HOME_LOCATION, "homeSector");
  assert.equal(TEACHER_ERROR_FIELDS.SCHOOL_LOCATION_MISMATCH, "school");
  for (const f of Object.values(TEACHER_ERROR_FIELDS)) assert.ok(typeof f === "string");
});

test("errors: server validation messages map to form fields (first message per field)", () => {
  const e = mapServerFieldErrors([
    "confirmPassword must be a string",
    "password must be longer than or equal to 8 characters",
    "olympiadInterests must contain at least 1 elements",
    "schoolId must be a UUID",
    "phone must be a string",
    "phone second message",
    "homeSector should not be empty",
    "something unrelated",
  ]);
  assert.deepEqual(e, {
    confirm: "confirmPassword must be a string",
    password: "password must be longer than or equal to 8 characters",
    interests: "olympiadInterests must contain at least 1 elements",
    school: "schoolId must be a UUID",
    phone: "phone must be a string",
    homeSector: "homeSector should not be empty",
  });
});

// ─── Administrator review ───────────────────────────────────────────────────

const permits = (...held) => (p) => held.includes(p);
const mode = (over) => teacherReviewMode({ detection: ON, detectionLoading: false, permissionsStatus: "ready", can: permits("users.manageTeachers"), ...over });

test("review page: needs the feature AND users.manageTeachers; waits while loading", () => {
  assert.equal(mode({}), "review");
  assert.equal(mode({ detectionLoading: true, detection: undefined }), "loading");
  assert.equal(mode({ permissionsStatus: "loading" }), "loading");
  assert.equal(mode({ detection: NEW(["teacherAccounts"]) }), "hidden");
  assert.equal(mode({ detection: { state: "LEGACY" } }), "hidden");
  assert.equal(mode({ can: permits("users.manage") }), "hidden");
  assert.equal(mode({ permissionsStatus: "error" }), "hidden");
});

test("menu: Teacher Applications only with the feature and the known permission; never in the frozen ADMIN_NAV", () => {
  assert.equal(ADMIN_TEACHER_APPLICATIONS.href, "/admin/teacher-applications");
  assert.equal(ADMIN_TEACHER_APPLICATIONS.permission, "users.manageTeachers");
  assert.ok(!ADMIN_NAV.some((i) => i.href === ADMIN_TEACHER_APPLICATIONS.href));
  assert.equal(teacherApplicationsNavVisible(ON, new Set(["users.manageTeachers"])), true);
  assert.equal(teacherApplicationsNavVisible(ON, new Set(["users.manage"])), false);
  assert.equal(teacherApplicationsNavVisible(ON, null), false, "unknown permissions: hidden");
  assert.equal(teacherApplicationsNavVisible(NEW([]), new Set(["users.manageTeachers"])), false);
  assert.equal(teacherApplicationsNavVisible(undefined, new Set(["users.manageTeachers"])), false);
});

const listed = { school: { id: "s1", name: "GS Tumba", code: "310001", province: "Southern Province", district: "Huye", sector: "Tumba" }, schoolProvince: "Southern Province", schoolDistrict: "Huye", schoolSector: null };
const missing = { school: null, schoolProvince: "Southern Province", schoolDistrict: "Huye", schoolSector: "Tumba" };

test("approval: a listed school is approved as is (no schoolId); a missing school requires one", () => {
  assert.equal(approvalNeedsSchool(listed), false);
  assert.equal(approvalNeedsSchool(missing), true);
  assert.deepEqual(approvalPayload(listed, null, ""), { ok: true, body: {} });
  assert.deepEqual(approvalPayload(listed, "other", "  ok  "), { ok: true, body: { note: "ok" } }, "never another school for a listed one");
  assert.equal(approvalPayload(missing, null, "").ok, false);
  assert.deepEqual(approvalPayload(missing, "s9", ""), { ok: true, body: { schoolId: "s9" } });
  assert.equal(approvalPayload(listed, null, "x".repeat(501)).ok, false);
});

test("rejection reason: 2–500 characters", () => {
  assert.ok(rejectionReasonProblem(" a "));
  assert.equal(rejectionReasonProblem("no"), null);
  assert.ok(rejectionReasonProblem("x".repeat(501)));
});

test("review errors and school place", () => {
  for (const code of ["APPLICATION_ALREADY_DECIDED", "SCHOOL_REQUIRED", "SCHOOL_MISMATCH", "UNKNOWN_SCHOOL", "TEACHERS_DISABLED"]) assert.ok(TEACHER_REVIEW_ERRORS[code], code);
  assert.equal(applicationSchoolPlace(listed), "Tumba, Huye, Southern Province");
  assert.equal(applicationSchoolPlace(missing), "Tumba, Huye, Southern Province");
});
