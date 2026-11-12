// School directory administration: gating, Rwanda / international validation, payloads,
// reasons, backend refusals, filters, impact and history (lib/admin/school-directory.ts).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  activeChangeExplanation,
  activeReasonProblem,
  codeProblem,
  createPayload,
  describeAuditEntry,
  emptySchoolForm,
  formFromSchool,
  impactLines,
  initialListState,
  interpretSaveError,
  isFiltered,
  isUuid,
  listFilters,
  placeLabel,
  provinceOfCode,
  reasonRequired,
  schoolDirectoryMode,
  updatePayload,
  validateSchoolForm,
  withReason,
} from "../lib/admin/school-directory.ts";
import { ApiError } from "../lib/api/errors.ts";

const NEW = (features) => ({ state: "NEW", schemaVersion: 1, roles: [], features });
const permits = (...held) => (p) => held.includes(p);
const mode = (over) => schoolDirectoryMode({ detection: NEW(["schoolAdministration"]), detectionLoading: false, permissionsStatus: "ready", can: permits("schools.manage"), ...over });

const school = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", name: "GS Kacyiru", code: "110001", countryCode: "RW",
  province: "Kigali City", district: "Gasabo", sector: "Kacyiru", cell: null, village: null, location: "Kacyiru, Gasabo",
  ownership: "PUBLIC", accommodation: null, source: "OFFICIAL_LIST", isActive: true, createdAt: "", updatedAt: "",
  lastSourceSyncAt: null, lastVerifiedAt: null, createdBy: null, ...over,
});
const rwForm = (over = {}) => ({ ...emptySchoolForm(), name: "Lycée de Ngoma", province: "Southern Province", district: "Huye", sector: "Ngoma", ...over });

// ─── Gating ─────────────────────────────────────────────────────────────────

test("manage only with BOTH the schoolAdministration capability and schools.manage", () => {
  assert.equal(mode({}), "manage");
  assert.equal(mode({ can: permits() }), "readOnly", "Administrator without schools.manage");
  assert.equal(mode({ detection: NEW(["schoolAffiliations"]) }), "readOnly", "new backend without the capability");
  assert.equal(mode({ detection: { state: "LEGACY" } }), "readOnly", "legacy backend");
  assert.equal(mode({ detection: { state: "UNKNOWN", reason: "timeout" } }), "readOnly", "UNKNOWN is never manage");
  assert.equal(mode({ permissionsStatus: "error" }), "readOnly", "permissions failed to load");
});

test("loading only while the first answers are outstanding — never decided by role", () => {
  assert.equal(mode({ permissionsStatus: "loading" }), "loading");
  assert.equal(mode({ detection: undefined, detectionLoading: true }), "loading");
  assert.equal(mode({ detection: undefined, detectionLoading: false }), "readOnly");
  // The function has no role input at all: a Super Administrator is "manage" only through the permission.
  assert.equal(schoolDirectoryMode.length, 1);
});

// ─── Rwanda rules ───────────────────────────────────────────────────────────

test("codes: 6 digits, first digit is the province (as the backend)", () => {
  assert.equal(provinceOfCode("210001"), "Southern Province");
  assert.equal(provinceOfCode("610001"), null);
  assert.equal(provinceOfCode("21000"), null);
  assert.equal(codeProblem("210001", "Southern Province"), null);
  assert.match(codeProblem("21000", null), /exactly 6 digits/);
  assert.match(codeProblem("910001", null), /starts with 1/);
  assert.match(codeProblem("110001", "Southern Province"), /belongs to Kigali City, not Southern Province/);
});

test("create, Rwanda: province, district and sector required; code optional but must match the province", () => {
  assert.deepEqual(validateSchoolForm(rwForm()), {});
  const e = validateSchoolForm(rwForm({ province: "", district: "", sector: "" }));
  assert.ok(e.province && e.district && e.sector);
  assert.deepEqual(validateSchoolForm(rwForm({ code: "220777" })), {});
  assert.match(validateSchoolForm(rwForm({ code: "120777" })).code, /belongs to Kigali City/);
  assert.match(validateSchoolForm(rwForm({ name: " x " })).name, /2–200/);
  assert.match(validateSchoolForm(rwForm({ name: "--" })).name, /letters or digits/);
  assert.match(validateSchoolForm(rwForm({ name: "Bad\u0007name" })).name, /control characters/);
  assert.match(validateSchoolForm(rwForm({ cell: "x".repeat(101) })).cell, /1–100/);
});

test("create, another country: a location is required; no code and no Rwandan place are sent", () => {
  const ke = { ...emptySchoolForm(), name: "Nairobi Academy", countryCode: "KE", location: "Nairobi" };
  assert.deepEqual(validateSchoolForm(ke), {});
  assert.match(validateSchoolForm({ ...ke, location: "" }).location, /needs a location/);
  assert.match(validateSchoolForm({ ...ke, code: "110001" }).code, /Rwanda/);
  assert.match(validateSchoolForm({ ...ke, countryCode: "Kenya" }).countryCode, /two-letter/);
  assert.deepEqual(createPayload({ ...ke, province: "Kigali City", district: "Gasabo", sector: "Kacyiru", code: "110001", cell: "c" }), {
    name: "Nairobi Academy", countryCode: "KE", location: "Nairobi",
  });
});

test("create payload: cleaned name, only what is set, duplicate confirmation only when asked", () => {
  assert.deepEqual(createPayload(rwForm({ name: "  Lycée   de Ngoma ", code: " 220777 ", cell: "  Butare  Town ", ownership: "PRIVATE" })), {
    name: "Lycée de Ngoma", countryCode: "RW", code: "220777", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Butare Town", ownership: "PRIVATE",
  });
  assert.equal(createPayload(rwForm()).confirmPossibleDuplicate, undefined);
  assert.equal(createPayload(rwForm(), true).confirmPossibleDuplicate, true);
});

// ─── Editing ────────────────────────────────────────────────────────────────

test("edit payload: only changed fields; moving abroad clears the Rwandan place with null", () => {
  const legacy = school({ code: null, source: "ADMIN" });
  assert.deepEqual(updatePayload(legacy, formFromSchool(legacy)), {});
  assert.deepEqual(updatePayload(legacy, { ...formFromSchool(legacy), name: "GS  Kacyiru II" }), { name: "GS Kacyiru II" });
  assert.deepEqual(updatePayload(legacy, { ...formFromSchool(legacy), countryCode: "KE", location: "Nairobi" }), {
    countryCode: "KE", province: null, district: null, sector: null, location: "Nairobi",
  });
  const withCell = school({ cell: "Kamatamu" });
  assert.deepEqual(updatePayload(withCell, { ...formFromSchool(withCell), cell: "" }), { cell: null });
  assert.deepEqual(updatePayload(withCell, { ...formFromSchool(withCell), accommodation: "BOARDING" }), { accommodation: "BOARDING" });
  // Ownership cannot be cleared (no null in the backend DTO): an empty choice sends nothing.
  assert.deepEqual(updatePayload(withCell, { ...formFromSchool(withCell), ownership: "" }), {});
});

test("reason: required to set/change a code, or the name/country/place of an official-directory school", () => {
  const official = school();
  const admin = school({ source: "ADMIN", code: null });
  assert.equal(reasonRequired(official, { name: "New" }), true);
  assert.equal(reasonRequired(official, { cell: "X" }), true);
  assert.equal(reasonRequired(official, { ownership: "PRIVATE" }), false);
  assert.equal(reasonRequired(admin, { name: "New" }), false);
  assert.equal(reasonRequired(admin, { code: "110002" }), true);
  assert.match(validateSchoolForm({ ...formFromSchool(official), name: "GS Kacyiru Renamed" }, official).reason, /required/);
  assert.deepEqual(validateSchoolForm({ ...formFromSchool(official), name: "GS Kacyiru Renamed", reason: "Renamed by NESA" }, official), {});
  assert.match(validateSchoolForm({ ...formFromSchool(admin), ownership: "PRIVATE", reason: "no" }, admin).reason, /3–500/);
  assert.deepEqual(withReason({ name: "X" }, "  Because  ", true), { name: "X", reason: "Because", confirmPossibleDuplicate: true });
  assert.deepEqual(withReason({ name: "X" }, "  "), { name: "X" });
});

test("edit: a code cannot be removed and a coded school stays in Rwanda; a legacy school may keep no place", () => {
  const official = school();
  assert.match(validateSchoolForm({ ...formFromSchool(official), code: "", reason: "x".repeat(5) }, official).code, /cannot be removed/);
  assert.match(validateSchoolForm({ ...formFromSchool(official), countryCode: "KE", location: "Nairobi", reason: "moved" }, official).countryCode, /stays in Rwanda/);
  const legacy = school({ source: "LEGACY", code: null, province: null, district: null, sector: null, location: "Huye" });
  assert.deepEqual(validateSchoolForm({ ...formFromSchool(legacy), name: "Old School" }, legacy), {});
  assert.ok(validateSchoolForm({ ...formFromSchool(legacy), province: "Southern Province" }, legacy).district, "a partial place must be completed");
});

// ─── Backend refusals ───────────────────────────────────────────────────────

const err = (status, code, details) => new ApiError(status, code, "msg", details);

test("refusals: duplicates, code conflicts and reasons map to their place in the form", () => {
  const cand = { id: "c1", name: "Lycée de Ngoma", code: null, countryCode: "RW", district: "Huye", isActive: true };
  assert.deepEqual(interpretSaveError(err(409, "POSSIBLE_DUPLICATE", { candidates: [cand, { bogus: true }] })).duplicates, [cand]);
  const taken = interpretSaveError(err(409, "SCHOOL_CODE_TAKEN", { schoolId: "other" }));
  assert.equal(taken.codeTakenBy, "other");
  assert.match(taken.fieldErrors.code, /already has this code/);
  assert.equal(interpretSaveError(err(409, "SCHOOL_CODE_TAKEN")).codeTakenBy, null);
  assert.ok(interpretSaveError(err(400, "REASON_REQUIRED")).fieldErrors.reason);
  assert.ok(interpretSaveError(err(400, "UNKNOWN_SCHOOL_LOCATION")).fieldErrors.sector);
  assert.ok(interpretSaveError(err(400, "SCHOOL_CODE_REQUIRED")).fieldErrors.code);
  assert.ok(interpretSaveError(err(400, "SCHOOL_DIRECTORY_RWANDA_ONLY")).fieldErrors.province);
  assert.equal(interpretSaveError(err(400, "NO_CHANGES")).noChanges, true);
  assert.equal(interpretSaveError(err(400, "INVALID_SCHOOL", { problems: ["A.", "B."] })).formError, "A. B.");
  assert.match(interpretSaveError(err(404, "NOT_FOUND")).formError, /no longer exists/);
  assert.match(interpretSaveError(err(0, "NETWORK_ERROR")).formError, /Cannot reach the server/);
  const v = interpretSaveError(err(400, "VALIDATION_FAILED", ["code must be exactly 6 digits.", "something else"]));
  assert.deepEqual(v.fieldErrors, { code: "code must be exactly 6 digits." });
});

// ─── Activate / deactivate ──────────────────────────────────────────────────

test("activation: a 3–500 character reason; impact and meaning spelled out", () => {
  assert.match(activeReasonProblem(""), /required/);
  assert.match(activeReasonProblem("no"), /3–500/);
  assert.equal(activeReasonProblem("Merged with another school"), null);
  assert.deepEqual(impactLines({ students: 1, verifiedStudents: 0, pendingClaims: 2, activeTeacherAssignments: 1, enrolments: 1200 }), [
    "1 student", "0 verified students (claim verified for this school)", "2 pending claims", "1 active Teacher assignment", "1,200 enrolment records",
  ]);
  assert.match(activeChangeExplanation(true), /kept.*no new registrations, claims, verifications or Teacher assignments/s);
  assert.match(activeChangeExplanation(false), /again/);
});

// ─── List filters ───────────────────────────────────────────────────────────

test("filters: empty ones are left out; places only for Rwanda; booleans for status and code", () => {
  assert.deepEqual(listFilters(initialListState()), { page: 1, limit: 20 });
  assert.equal(isFiltered(initialListState()), false);
  const s = { ...initialListState(), q: "  kacy ", countryCode: "rw", province: "Kigali City", district: "Gasabo", status: "inactive", source: "LEGACY", code: "without", page: 3 };
  assert.deepEqual(listFilters(s), { page: 3, limit: 20, q: "kacy", countryCode: "RW", province: "Kigali City", district: "Gasabo", isActive: false, source: "LEGACY", hasCode: false });
  assert.equal(isFiltered(s), true);
  assert.deepEqual(listFilters({ ...initialListState(), countryCode: "KE", province: "Kigali City" }), { page: 1, limit: 20, countryCode: "KE" });
  assert.equal(listFilters({ ...initialListState(), q: "x".repeat(150) }).q.length, 100);
  assert.equal(listFilters({ ...initialListState(), page: 0 }).page, 1);
});

// ─── Labels and history ─────────────────────────────────────────────────────

test("places, ids and audit entries read in plain language", () => {
  assert.equal(placeLabel(school()), "Kacyiru, Gasabo, Kigali City");
  assert.equal(placeLabel(school({ countryCode: "KE", province: null, district: null, sector: null, location: "Nairobi" })), "Nairobi (KE)");
  assert.equal(isUuid(school().id), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.deepEqual(describeAuditEntry({ action: "UPDATE_SCHOOL", metadata: { changes: { name: { from: "A", to: "B" }, cell: { from: null, to: "X" } }, reason: "Renamed", confirmedPossibleDuplicate: true } }), {
    title: "Edited", lines: ["Name: A → B", "Cell: — → X", "Reason: Renamed", "Saved although schools with the same name exist nearby (confirmed)."],
  });
  assert.deepEqual(describeAuditEntry({ action: "SCHOOL_DEACTIVATED", metadata: { reason: "Closed" } }), { title: "Deactivated", lines: ["Reason: Closed"] });
  assert.equal(describeAuditEntry({ action: "SCHOOL_CLAIM_VERIFIED", metadata: null }).title, "School claim verified");
});
