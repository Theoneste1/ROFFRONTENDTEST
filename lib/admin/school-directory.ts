/**
 * School directory administration: pure rules for the admin pages (no React; unit-tested in
 * tests/school-directory.test.mjs). Validation mirrors the backend (CreateSchoolDto /
 * UpdateSchoolDto, school-rules.ts, school-validation.ts); the backend stays the authority and
 * every refusal it sends is mapped to a field or a message here.
 */
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { ApiError, errorMessage, isApiError } from "../api/errors";
import type {
  CreateSchoolInput,
  DirectoryListFilters,
  DirectorySchoolRecord,
  DuplicateCandidate,
  SchoolAccommodation,
  SchoolAuditEntry,
  SchoolClaimStatus,
  SchoolImpact,
  SchoolOwnership,
  SchoolSource,
  UpdateSchoolInput,
} from "../api/school-directory";

// ─── Which page to show ─────────────────────────────────────────────────────

export type SchoolDirectoryMode = "loading" | "manage" | "readOnly";

/**
 * "manage" needs BOTH: the backend advertises `schoolAdministration` (GET /api/v1) and the
 * signed-in user's `GET /me/permissions` lists `schools.manage`. Everything else — a legacy
 * backend, an UNKNOWN detection, a missing permission, permissions that failed to load — keeps
 * the existing read-only pages, which work on both backends. Never decided by role.
 * "loading" only while the first answers are outstanding, so the page does not flip.
 */
export function schoolDirectoryMode(input: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (permission: "schools.manage") => boolean;
}): SchoolDirectoryMode {
  if (input.permissionsStatus === "loading" || (input.detection === undefined && input.detectionLoading)) return "loading";
  if (input.permissionsStatus !== "ready") return "readOnly";
  return hasFeature(input.detection, "schoolAdministration") && input.can("schools.manage") ? "manage" : "readOnly";
}

// ─── Rwanda rules (backend school-rules.ts) ─────────────────────────────────

export const RWANDA = "RW";

/** Province of each code prefix, exactly as the backend stores it. */
export const PROVINCE_BY_CODE_PREFIX: Readonly<Record<string, string>> = {
  "1": "Kigali City",
  "2": "Southern Province",
  "3": "Western Province",
  "4": "Northern Province",
  "5": "Eastern Province",
};

export const SCHOOL_CODE_PATTERN = /^\d{6}$/;

export function provinceOfCode(code: string): string | null {
  if (!SCHOOL_CODE_PATTERN.test(code)) return null;
  return PROVINCE_BY_CODE_PREFIX[code[0]] ?? null;
}

/** The problem with a Rwandan code for a school in `province`, or null. */
export function codeProblem(code: string, province: string | null | undefined): string | null {
  if (!SCHOOL_CODE_PATTERN.test(code)) return "A school code is exactly 6 digits.";
  const expected = provinceOfCode(code);
  if (!expected) return "A school code starts with 1 (Kigali City), 2 (Southern), 3 (Western), 4 (Northern) or 5 (Eastern).";
  if (province && province !== expected) return `Code ${code} belongs to ${expected}, not ${province}.`;
  return null;
}

/** As the backend stores a name: trimmed, inner whitespace collapsed (case and accents kept). */
export const cleanSchoolName = (name: string) => name.replace(/\s+/g, " ").trim();
/** Cell / village as the backend stores them. */
export const cleanPlace = (value: string) => value.trim().replace(/\s+/g, " ");

const CONTROL = /\p{Cc}/u;
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
export const isCountryCode = (v: string) => /^[A-Z]{2}$/.test(v);

export const OWNERSHIP_OPTIONS: readonly SchoolOwnership[] = ["PUBLIC", "GOVERNMENT_AIDED", "PRIVATE"];
export const ACCOMMODATION_OPTIONS: readonly SchoolAccommodation[] = ["DAY", "BOARDING", "MIXED"];

// ─── The create / edit form ─────────────────────────────────────────────────

export interface SchoolForm {
  name: string;
  /** "RW" or another ISO 3166-1 alpha-2 code (upper case). */
  countryCode: string;
  code: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  location: string;
  ownership: SchoolOwnership | "";
  accommodation: SchoolAccommodation | "";
  reason: string;
}

export type SchoolFormField = keyof SchoolForm;
export type SchoolFormErrors = Partial<Record<SchoolFormField, string>>;

export const emptySchoolForm = (): SchoolForm => ({
  name: "", countryCode: RWANDA, code: "", province: "", district: "", sector: "", cell: "", village: "",
  location: "", ownership: "", accommodation: "", reason: "",
});

export function formFromSchool(s: DirectorySchoolRecord): SchoolForm {
  return {
    name: s.name, countryCode: s.countryCode, code: s.code ?? "", province: s.province ?? "", district: s.district ?? "",
    sector: s.sector ?? "", cell: s.cell ?? "", village: s.village ?? "", location: s.location ?? "",
    ownership: s.ownership ?? "", accommodation: s.accommodation ?? "", reason: "",
  };
}

const lengthProblem = (v: string, min: number, max: number, what: string) =>
  v.length < min || v.length > max ? `${what} must be ${min}–${max} characters.` : CONTROL.test(v) ? `${what} must not contain control characters.` : null;

/**
 * Field problems before sending. `school` is the record being edited (null: create).
 * The reason is checked only when the change needs one (see reasonRequired).
 */
export function validateSchoolForm(f: SchoolForm, school: DirectorySchoolRecord | null = null): SchoolFormErrors {
  const e: SchoolFormErrors = {};
  const name = cleanSchoolName(f.name);
  const nameProblem = lengthProblem(name, 2, 200, "The name");
  if (nameProblem) e.name = nameProblem;
  else if (!HAS_LETTER_OR_DIGIT.test(name)) e.name = "The name must contain letters or digits.";

  const country = f.countryCode.trim().toUpperCase();
  if (!isCountryCode(country)) e.countryCode = "Use a two-letter country code, e.g. KE or UG.";

  const code = f.code.trim();
  if (country === RWANDA) {
    const legacyWithoutPlace = school?.source === "LEGACY" && !f.province && !f.district && !f.sector && !f.cell.trim() && !f.village.trim() && !code;
    if (!legacyWithoutPlace) {
      if (!f.province) e.province = "Choose the province.";
      if (!f.district) e.district = "Choose the district.";
      if (!f.sector) e.sector = "Choose the sector.";
    }
    if (code) {
      const p = codeProblem(code, f.province || null);
      if (p) e.code = p;
    }
    for (const k of ["cell", "village"] as const) {
      const v = cleanPlace(f[k]);
      if (v) {
        const p = lengthProblem(v, 1, 100, k === "cell" ? "The cell" : "The village");
        if (p) e[k] = p;
      }
    }
    const location = f.location.trim();
    if (location) {
      const p = lengthProblem(location, 2, 200, "The location");
      if (p) e.location = p;
    }
  } else if (isCountryCode(country)) {
    if (code) e.code = "School codes are for schools in Rwanda.";
    const p = lengthProblem(f.location.trim(), 2, 200, "The location");
    if (p) e.location = f.location.trim() ? p : "A school outside Rwanda needs a location (e.g. Nairobi).";
  }

  if (school?.code && !code) e.code = "A school code cannot be removed.";
  if (school?.code && country !== RWANDA && isCountryCode(country)) e.countryCode = "A school with a code stays in Rwanda.";

  if (school) {
    const payload = updatePayload(school, f);
    const reason = f.reason.trim();
    if (reasonRequired(school, payload) && !reason) e.reason = "A reason is required for this change.";
    else if (reason) {
      const p = lengthProblem(reason, 3, 500, "The reason");
      if (p) e.reason = p;
    }
  }
  return e;
}

/** `POST /admin/schools` body: only what is set, and the place rules of the chosen country. */
export function createPayload(f: SchoolForm, confirmPossibleDuplicate = false): CreateSchoolInput {
  const country = f.countryCode.trim().toUpperCase();
  const out: CreateSchoolInput = { name: cleanSchoolName(f.name), countryCode: country };
  if (country === RWANDA) {
    if (f.code.trim()) out.code = f.code.trim();
    if (f.province) out.province = f.province;
    if (f.district) out.district = f.district;
    if (f.sector) out.sector = f.sector;
    if (cleanPlace(f.cell)) out.cell = cleanPlace(f.cell);
    if (cleanPlace(f.village)) out.village = cleanPlace(f.village);
  }
  if (f.location.trim()) out.location = f.location.trim();
  if (f.ownership) out.ownership = f.ownership;
  if (f.accommodation) out.accommodation = f.accommodation;
  if (confirmPossibleDuplicate) out.confirmPossibleDuplicate = true;
  return out;
}

/**
 * `PATCH /admin/schools/:id` body: only the fields that change. Moving a school out of Rwanda
 * clears its province / district / sector / cell / village (null), as the backend requires.
 * Ownership cannot be cleared (the backend accepts no null for it).
 */
export function updatePayload(school: DirectorySchoolRecord, f: SchoolForm): UpdateSchoolInput {
  const out: UpdateSchoolInput = {};
  const country = f.countryCode.trim().toUpperCase();
  const name = cleanSchoolName(f.name);
  // A field the administrator did not touch is never sent: stored values may keep inner spaces
  // (the directory sync trims only the ends), so the cleaned form value alone would differ.
  if (f.name !== school.name && name !== school.name) out.name = name;
  if (country !== school.countryCode) out.countryCode = country;
  const code = f.code.trim();
  if (code && code !== (school.code ?? "")) out.code = code;

  const rwanda = country === RWANDA;
  const place = (k: "province" | "district" | "sector", v: string) => {
    const next = rwanda ? v || null : null;
    if (next !== (school[k] ?? null)) out[k] = next;
  };
  place("province", f.province);
  place("district", f.district);
  place("sector", f.sector);
  for (const k of ["cell", "village"] as const) {
    // Untouched in Rwanda: kept. Moved out of Rwanda: cleared even when untouched.
    const untouched = rwanda && f[k] === (school[k] ?? "");
    const next = rwanda ? cleanPlace(f[k]) || null : null;
    if (!untouched && next !== (school[k] ?? null)) out[k] = next;
  }
  const location = f.location.trim();
  if (f.location !== (school.location ?? "") && location && location !== school.location) out.location = location;
  if (f.ownership && f.ownership !== school.ownership) out.ownership = f.ownership;
  const accommodation = f.accommodation || null;
  if (accommodation !== (school.accommodation ?? null)) out.accommodation = accommodation;
  return out;
}

const DIRECTORY_FIELDS = ["name", "countryCode", "province", "district", "sector", "cell", "village"] as const;

/** As the backend's REASON_REQUIRED: setting or changing a code, or an official-directory school's name, country or place. */
export function reasonRequired(school: DirectorySchoolRecord, payload: UpdateSchoolInput): boolean {
  if (payload.code !== undefined) return true;
  return school.source === "OFFICIAL_LIST" && DIRECTORY_FIELDS.some((k) => payload[k] !== undefined);
}

/** The payload plus the reason and duplicate confirmation, ready to send. */
export function withReason(payload: UpdateSchoolInput, reason: string, confirmPossibleDuplicate = false): UpdateSchoolInput {
  const out = { ...payload };
  if (reason.trim()) out.reason = reason.trim();
  if (confirmPossibleDuplicate) out.confirmPossibleDuplicate = true;
  return out;
}

// ─── Backend refusals ───────────────────────────────────────────────────────

export interface SaveProblem {
  fieldErrors: SchoolFormErrors;
  /** A message for the whole form (null when a field carries it). */
  formError: string | null;
  /** 409 POSSIBLE_DUPLICATE: schools with the same name nearby; the user may confirm. */
  duplicates: DuplicateCandidate[] | null;
  /** 409 SCHOOL_CODE_TAKEN: the school that already has the code (when the backend says which). */
  codeTakenBy: string | null;
  /** 400 NO_CHANGES: nothing to save (informational). */
  noChanges: boolean;
}

const FORM_FIELDS: readonly SchoolFormField[] = [
  "name", "countryCode", "code", "province", "district", "sector", "cell", "village", "location", "ownership", "accommodation", "reason",
];

function candidatesOf(err: ApiError): DuplicateCandidate[] {
  const d = err.details as { candidates?: unknown } | undefined;
  return Array.isArray(d?.candidates)
    ? d!.candidates.filter((c): c is DuplicateCandidate => typeof c === "object" && c !== null && typeof (c as DuplicateCandidate).id === "string")
    : [];
}

/** Maps a failed create / edit to fields and messages (branching on `code`, never on `message`). */
export function interpretSaveError(err: unknown): SaveProblem {
  const out: SaveProblem = { fieldErrors: {}, formError: null, duplicates: null, codeTakenBy: null, noChanges: false };
  if (!isApiError(err)) {
    out.formError = errorMessage(err);
    return out;
  }
  switch (err.code) {
    case "POSSIBLE_DUPLICATE":
      out.duplicates = candidatesOf(err);
      return out;
    case "SCHOOL_CODE_TAKEN": {
      const id = (err.details as { schoolId?: unknown } | undefined)?.schoolId;
      out.codeTakenBy = typeof id === "string" ? id : null;
      out.fieldErrors.code = "Another school already has this code.";
      return out;
    }
    case "SCHOOL_CODE_REQUIRED":
      out.fieldErrors.code = "A school code cannot be removed.";
      return out;
    case "SCHOOL_CODE_RWANDA_ONLY":
      out.fieldErrors.code = "School codes are for schools in Rwanda.";
      return out;
    case "SCHOOL_DIRECTORY_RWANDA_ONLY":
      out.fieldErrors.province = "Province, district, sector, cell and village are for schools in Rwanda; give a location instead.";
      return out;
    case "UNKNOWN_SCHOOL_LOCATION":
      out.fieldErrors.sector = "This province, district and sector are not in the official directory.";
      return out;
    case "INVALID_SCHOOL_NAME":
      out.fieldErrors.name = "The name must contain letters or digits.";
      return out;
    case "REASON_REQUIRED":
      out.fieldErrors.reason = "A reason is required for this change.";
      return out;
    case "NO_CHANGES":
      out.noChanges = true;
      out.formError = "Nothing has changed.";
      return out;
    case "INVALID_SCHOOL": {
      const problems = (err.details as { problems?: unknown } | undefined)?.problems;
      out.formError = Array.isArray(problems) && problems.length ? problems.filter((p) => typeof p === "string").join(" ") : err.message;
      return out;
    }
    case "VALIDATION_FAILED": {
      for (const msg of err.validationMessages) {
        const field = FORM_FIELDS.find((f) => msg === f || msg.startsWith(f + " "));
        if (field && !out.fieldErrors[field]) out.fieldErrors[field] = msg;
      }
      if (!Object.keys(out.fieldErrors).length) out.formError = errorMessage(err);
      return out;
    }
    default:
      out.formError = err.status === 404 ? "This school no longer exists. Close this dialog and refresh the list." : errorMessage(err);
      return out;
  }
}

// ─── Activate / deactivate ──────────────────────────────────────────────────

export const ACTIVE_REASON = { min: 3, max: 500 };

export function activeReasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "A reason is required.";
  if (r.length < ACTIVE_REASON.min || r.length > ACTIVE_REASON.max) return `The reason must be ${ACTIVE_REASON.min}–${ACTIVE_REASON.max} characters.`;
  return null;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What refers to the school, as sentences for the confirmation (none of it is changed). */
export function impactLines(impact: SchoolImpact): string[] {
  return [
    plural(impact.students, "student", "students"),
    `${plural(impact.verifiedStudents, "verified student", "verified students")} (claim verified for this school)`,
    plural(impact.pendingClaims, "pending claim", "pending claims"),
    plural(impact.activeTeacherAssignments, "active Teacher assignment", "active Teacher assignments"),
    plural(impact.enrolments, "enrolment record", "enrolment records"),
  ];
}

/** What deactivating / reactivating means, as the backend applies it (school-usage.ts). */
export function activeChangeExplanation(deactivate: boolean): string {
  return deactivate
    ? "Existing students, verified claims, enrolments and Teacher access are kept. While inactive, the school accepts no new registrations, claims, verifications or Teacher assignments."
    : "The school accepts new registrations, claims, verifications and Teacher assignments again. Nothing recorded while it was inactive is changed.";
}

// ─── List filters ───────────────────────────────────────────────────────────

export interface ListState {
  q: string;
  /** "" any, "RW", or another ISO code. */
  countryCode: string;
  province: string;
  district: string;
  sector: string;
  status: "all" | "active" | "inactive";
  source: SchoolSource | "";
  code: "any" | "with" | "without";
  page: number;
}

export const initialListState = (): ListState => ({ q: "", countryCode: "", province: "", district: "", sector: "", status: "all", source: "", code: "any", page: 1 });

export const LIST_PAGE_SIZE = 20;

/** The request for a list state: empty filters are left out; places only for Rwanda. */
export function listFilters(s: ListState): DirectoryListFilters {
  const out: DirectoryListFilters = { page: Math.max(1, Math.floor(s.page) || 1), limit: LIST_PAGE_SIZE };
  const q = s.q.trim().slice(0, 100);
  if (q) out.q = q;
  const country = s.countryCode.trim().toUpperCase();
  if (isCountryCode(country)) out.countryCode = country;
  if (country === RWANDA || country === "") {
    if (s.province) out.province = s.province;
    if (s.district) out.district = s.district;
    if (s.sector) out.sector = s.sector;
  }
  if (s.status !== "all") out.isActive = s.status === "active";
  if (s.source) out.source = s.source;
  if (s.code !== "any") out.hasCode = s.code === "with";
  return out;
}

/** True when any filter (other than the page) narrows the list. */
export function isFiltered(s: ListState): boolean {
  return Object.keys(listFilters(s)).some((k) => k !== "page" && k !== "limit");
}

// ─── Labels ─────────────────────────────────────────────────────────────────

export const SOURCE_LABEL: Record<SchoolSource, string> = { OFFICIAL_LIST: "Official directory", ADMIN: "Added by an administrator", LEGACY: "Legacy" };
export const OWNERSHIP_LABEL: Record<SchoolOwnership, string> = { PUBLIC: "Public", GOVERNMENT_AIDED: "Government-aided", PRIVATE: "Private" };
export const ACCOMMODATION_LABEL: Record<SchoolAccommodation, string> = { DAY: "Day", BOARDING: "Boarding", MIXED: "Day and boarding" };
export const CLAIM_LABEL: Record<SchoolClaimStatus, string> = { PENDING: "Claim pending", VERIFIED: "Verified", REJECTED: "Claim rejected", REVOKED: "Verification revoked" };

/** "Ngoma, Huye, Southern Province" in Rwanda; "Nairobi (KE)" elsewhere. */
export function placeLabel(s: Pick<DirectorySchoolRecord, "countryCode" | "province" | "district" | "sector" | "location">): string {
  if (s.countryCode === RWANDA) {
    const parts = [s.sector, s.district, s.province].filter(Boolean);
    return parts.length ? parts.join(", ") : s.location || "No place recorded";
  }
  return `${s.location || "No location"} (${s.countryCode})`;
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ─── History ────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  CREATE_SCHOOL: "Created",
  UPDATE_SCHOOL: "Edited",
  SCHOOL_DEACTIVATED: "Deactivated",
  SCHOOL_REACTIVATED: "Reactivated",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name", countryCode: "Country", code: "Code", province: "Province", district: "District", sector: "Sector",
  cell: "Cell", village: "Village", location: "Location", ownership: "Ownership", accommodation: "Accommodation",
};

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));

/** One audit entry as a title and detail lines (field changes, reason, duplicate confirmation). */
export function describeAuditEntry(entry: Pick<SchoolAuditEntry, "action" | "metadata">): { title: string; lines: string[] } {
  const title = ACTION_LABEL[entry.action] ?? entry.action.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const m = (entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}) as Record<string, unknown>;
  const lines: string[] = [];
  const changes = m.changes && typeof m.changes === "object" ? (m.changes as Record<string, { from?: unknown; to?: unknown }>) : null;
  if (changes) {
    for (const [field, c] of Object.entries(changes)) lines.push(`${FIELD_LABEL[field] ?? field}: ${show(c?.from)} → ${show(c?.to)}`);
  }
  if (typeof m.reason === "string" && m.reason) lines.push(`Reason: ${m.reason}`);
  if (m.confirmedPossibleDuplicate === true) lines.push("Saved although schools with the same name exist nearby (confirmed).");
  return { title, lines };
}
