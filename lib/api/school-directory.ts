/**
 * School directory administration (backend `develop`, src/schools/admin-schools.controller.ts and
 * school-directory-data.service.ts). Every route needs `schools.manage` (Administrators and Super
 * Administrators); none of them exists on the legacy production backend, which only has the
 * read-only `GET /schools` and `GET /schools/:id` (lib/api/admin.ts → schoolsApi).
 *
 *   GET   /admin/schools                list (filters, paginated) with student counts
 *   GET   /admin/schools/:id            a school and what refers to it (counts)
 *   GET   /admin/schools/:id/students   its students, each with their claim for THIS school
 *   GET   /admin/schools/:id/history    source records; audit entries only with `audit.view`
 *   POST  /admin/schools                create (409 SCHOOL_CODE_TAKEN / POSSIBLE_DUPLICATE)
 *   PATCH /admin/schools/:id            edit (reason required for code / official-place changes)
 *   PATCH /admin/schools/:id/active     deactivate / reactivate (reason required)
 *   GET   /admin/schools/import-template  CSV / XLSX template
 *   POST  /admin/schools/import         CSV / XLSX import: dry run, then all-or-nothing import
 *   GET   /admin/schools/reference-data education levels and programmes
 *   GET   /admin/schools/:id/contacts   contacts (full values: these routes only)
 *   PUT   /admin/schools/:id/contacts   replace the active contacts
 *   POST  /admin/schools/:id/contacts/:contactId/verify
 *   GET   /admin/schools/:id/offerings  education levels and programmes
 *   PUT   /admin/schools/:id/offerings  replace them
 *
 * Use these only when the backend advertises `schoolAdministration` AND the user holds
 * `schools.manage` (lib/admin/school-directory.ts → schoolDirectoryMode). Not to be confused with
 * `schoolDirectoryApi` in lib/api/accounts.ts (the public search and locations).
 */
import { api, apiBlob, saveFile, type QueryValue } from "./client";
import type { GradeLevel, Page } from "./types";

export type SchoolSource = "OFFICIAL_LIST" | "ADMIN" | "LEGACY";
export type SchoolOwnership = "PUBLIC" | "GOVERNMENT_AIDED" | "PRIVATE";
export type SchoolAccommodation = "DAY" | "BOARDING" | "MIXED";
export type SchoolClaimStatus = "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED";

/** The school record as every /admin/schools route returns it (backend SCHOOL_SELECT). */
export interface DirectorySchoolRecord {
  id: string;
  name: string;
  /** Rwanda only: 6 digits, the first is the province. */
  code: string | null;
  /** ISO 3166-1 alpha-2 (RW for Rwanda). */
  countryCode: string;
  province: string | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  location: string;
  ownership: SchoolOwnership | null;
  accommodation: SchoolAccommodation | null;
  source: SchoolSource;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSourceSyncAt: string | null;
  lastVerifiedAt: string | null;
  /** Who last verified the school (absent from backends before school verification). */
  lastVerifiedBy?: { id: string; username: string } | null;
  createdBy: { id: string; username: string } | null;
}

/** `GET /admin/schools` item. */
export interface DirectorySchoolRow extends DirectorySchoolRecord {
  students: number;
  /** Students whose CURRENT school claim an Administrator verified. */
  verifiedStudents: number;
  /** Backends with primaryTeacher / schoolsTable: the school's primary teacher (main contact), or null. */
  primaryTeacher?: { id: string; username: string; firstName: string; lastName: string } | null;
}

/** What refers to a school — none of it is changed by deactivating or reactivating. */
export interface SchoolImpact {
  students: number;
  verifiedStudents: number;
  pendingClaims: number;
  activeTeacherAssignments: number;
  enrolments: number;
}

/** `GET /admin/schools/:id`. */
export interface DirectorySchoolDetail extends DirectorySchoolRecord {
  counts: SchoolImpact;
}

/** `GET /admin/schools/:id/students` item. */
export interface DirectorySchoolStudent {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  gradeLevel: GradeLevel | null;
  isActive: boolean;
  isApproved: boolean;
  division: { id: string; code: string; name: string } | null;
  /** The student's current claim when it is for THIS school; null otherwise. */
  claim: { id: string; status: SchoolClaimStatus } | null;
}

/** `GET /admin/schools/:id/history`: source records (contact values masked) and, with audit.view, audit entries. */
export interface SchoolHistory {
  schoolId: string;
  sourceRecords: SchoolSourceRecord[];
  /** False when the caller lacks `audit.view`: `audit` is then null. */
  auditVisible: boolean;
  audit: Page<SchoolAuditEntry> | null;
}

export interface SchoolSourceRecord {
  id: string;
  dataSource: { key: string; name: string };
  datasetLabel: string | null;
  datasetSha256: string | null;
  sourceRef: string | null;
  raw: unknown;
  rowHash: string | null;
  matchedBy: string | null;
  issues: unknown;
  createdAt: string;
}

export interface SchoolAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  metadata: unknown;
  createdAt: string;
}

/** `GET /admin/schools` filters (backend ListAdminSchoolsDto). */
export interface DirectoryListFilters {
  /** Name (contains) or code (starts with), 1–100 characters. */
  q?: string;
  countryCode?: string;
  province?: string;
  district?: string;
  sector?: string;
  isActive?: boolean;
  source?: SchoolSource;
  hasCode?: boolean;
  /** Offers this education level (PPR, PR, OL, AL, PE). */
  level?: string;
  /** Offers this programme (its id). */
  programme?: string;
  accommodation?: SchoolAccommodation;
  /** true: its source records report data problems. */
  hasSourceIssues?: boolean;
  /** Backends with schoolListFilters (2026-11-23). */
  ownership?: SchoolOwnership;
  cell?: string;
  village?: string;
  /** An active e-mail or phone containing this text (3–100 characters). */
  contact?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  programmeCategory?: ProgrammeCategory;
  /** Backends with schoolsTable: name (default) or verifiedStudents; asc (default) or desc. */
  sort?: "name" | "verifiedStudents";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

/** `POST /admin/schools` body (backend CreateSchoolDto). */
export interface CreateSchoolInput {
  name: string;
  countryCode?: string;
  code?: string;
  province?: string;
  district?: string;
  sector?: string;
  location?: string;
  ownership?: SchoolOwnership;
  cell?: string;
  village?: string;
  accommodation?: SchoolAccommodation;
  confirmPossibleDuplicate?: boolean;
}

/** `PATCH /admin/schools/:id` body (backend UpdateSchoolDto): only what changes; null clears. */
export interface UpdateSchoolInput {
  name?: string;
  countryCode?: string;
  code?: string;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  location?: string;
  ownership?: SchoolOwnership;
  cell?: string | null;
  village?: string | null;
  accommodation?: SchoolAccommodation | null;
  reason?: string;
  confirmPossibleDuplicate?: boolean;
}

/** `PATCH /admin/schools/:id/active` response. */
export interface SetActiveResult {
  school: DirectorySchoolRecord;
  /** False when the school already had this state (nothing written). */
  changed: boolean;
  impact: SchoolImpact;
  /** Deactivation only: what is kept and what is refused. */
  warning?: string;
}

/** A `409 POSSIBLE_DUPLICATE` candidate (`details.candidates`). */
export interface DuplicateCandidate {
  id: string;
  name: string;
  code: string | null;
  countryCode: string;
  district: string | null;
  isActive: boolean;
}

export const adminSchoolsApi = {
  list: (filters: DirectoryListFilters = {}) => api<Page<DirectorySchoolRow>>("/admin/schools", { query: filters }),
  get: (id: string) => api<DirectorySchoolDetail>(`/admin/schools/${id}`),
  students: (id: string, params: { page?: number; limit?: number } = {}) =>
    api<Page<DirectorySchoolStudent>>(`/admin/schools/${id}/students`, { query: params }),
  history: (id: string, params: { page?: number; limit?: number } = {}) => api<SchoolHistory>(`/admin/schools/${id}/history`, { query: params }),
  create: (input: CreateSchoolInput) => api<DirectorySchoolRecord>("/admin/schools", { method: "POST", body: input }),
  update: (id: string, input: UpdateSchoolInput) => api<DirectorySchoolRecord>(`/admin/schools/${id}`, { method: "PATCH", body: input }),
  setActive: (id: string, input: { isActive: boolean; reason: string }) =>
    api<SetActiveResult>(`/admin/schools/${id}/active`, { method: "PATCH", body: input }),
  /** Record that an administrator checked the school's name and place (audited). */
  verify: (id: string, input: { note?: string } = {}) =>
    api<DirectorySchoolRecord>(`/admin/schools/${id}/verify`, { method: "POST", body: input }),

  /** Saves the import template (CSV: header row; XLSX: a Schools sheet and an Instructions sheet). */
  downloadImportTemplate: async (format: "csv" | "xlsx") =>
    saveFile(await apiBlob("/admin/schools/import-template", { query: { format } }, `schools-import-template.${format}`)),
  /** Dry run (200, nothing created) or import (201). Refusals: 422 IMPORT_INVALID, 409 POSSIBLE_DUPLICATES_UNCONFIRMED / IMPORT_REVIEW_OUTDATED. */
  importSchools: (file: File, query: SchoolImportQuery) => {
    const form = new FormData();
    form.append("file", file);
    return api<SchoolImportDryRun | SchoolImportDone>("/admin/schools/import", { method: "POST", body: form, query: { ...query } });
  },

  referenceData: () => api<SchoolReferenceData>("/admin/schools/reference-data"),
  contacts: (id: string, includeRemoved = false) =>
    api<{ schoolId: string; contacts: SchoolContact[] }>(`/admin/schools/${id}/contacts`, { query: { includeRemoved } }),
  putContacts: (id: string, input: PutSchoolContactsInput) =>
    api<{ schoolId: string; changed: boolean; contacts: SchoolContact[] }>(`/admin/schools/${id}/contacts`, { method: "PUT", body: input }),
  verifyContact: (id: string, contactId: string, input: VerifySchoolContactInput) =>
    api<SchoolContact>(`/admin/schools/${id}/contacts/${contactId}/verify`, { method: "POST", body: input }),
  offerings: (id: string) => api<SchoolOfferings>(`/admin/schools/${id}/offerings`),
  putOfferings: (id: string, input: PutSchoolOfferingsInput) =>
    api<SchoolOfferings & { changed: boolean }>(`/admin/schools/${id}/offerings`, { method: "PUT", body: input }),
};

// ─── Import ─────────────────────────────────────────────────────────────────

export interface SchoolImportQuery {
  dryRun?: boolean;
  confirmPossibleDuplicates?: boolean;
  reviewToken?: string;
}

/** A school that may be the same as an imported row (same name in the same district, or country). */
export interface ImportDuplicateCandidate {
  id: string;
  name: string;
  code: string | null;
  countryCode: string;
  district: string | null;
  isActive: boolean;
}

export interface ImportRowErrors {
  row: number;
  errors: string[];
}

export interface ImportPossibleDuplicate {
  row: number;
  name: string;
  candidates: ImportDuplicateCandidate[];
}

/** `POST /admin/schools/import?dryRun=true` (200). */
export interface SchoolImportDryRun {
  dryRun: true;
  totalRows: number;
  valid: number;
  failed: number;
  errors: ImportRowErrors[];
  possibleDuplicates: ImportPossibleDuplicate[];
  /** Only when every row is valid and some have possible duplicates (valid 15 minutes). */
  reviewToken?: string;
  reviewExpiresAt?: string;
  canImport: boolean;
}

/** `POST /admin/schools/import` (201): every school was created, or none. */
export interface SchoolImportDone {
  dryRun: false;
  importId: string;
  totalRows: number;
  created: number;
  confirmedPossibleDuplicates: number;
  schools: Array<{ row: number; id: string; name: string; code: string | null }>;
}

// ─── Contacts and offerings ─────────────────────────────────────────────────

export type SchoolContactType = "EMAIL" | "PHONE" | "OTHER";
export type SchoolContactVisibility = "ADMIN_ONLY" | "REPRESENTATIVES";

export interface SchoolContact {
  id: string;
  type: SchoolContactType;
  /** Normalised (e-mail lower case; phone E.164 where recognisable). */
  value: string;
  rawValue: string | null;
  label: string | null;
  isPrimary: boolean;
  visibility: SchoolContactVisibility;
  verifiedAt: string | null;
  verifiedBy: { id: string; username: string } | null;
  /** null: entered by an administrator. */
  dataSource: { key: string } | null;
  createdAt: string;
  updatedAt: string;
  removedAt: string | null;
  removedBy: { id: string; username: string } | null;
}

export interface ContactInput {
  /** An existing active contact (keeps its verification while type and value are unchanged); omitted for a new one. */
  id?: string;
  type: SchoolContactType;
  value: string;
  label?: string;
  isPrimary?: boolean;
}

/** `PUT /admin/schools/:id/contacts`: the complete list of active contacts (left out → removed, kept as removed). */
export interface PutSchoolContactsInput {
  contacts: ContactInput[];
  reason?: string;
}

export interface VerifySchoolContactInput {
  visibility?: SchoolContactVisibility;
  reason?: string;
}

export type ProgrammeCategory = "A_LEVEL_COMBINATION" | "TVET_TRADE" | "OTHER";

export interface DirectoryProgramme {
  id: string;
  code: string | null;
  name: string;
  category: ProgrammeCategory;
  tvetLevel: number | null;
  /** Not yet reviewed: never presented as a verified offering. */
  needsReview: boolean;
}

export interface SchoolReferenceData {
  educationLevels: Array<{ code: string; name: string; sortOrder: number }>;
  programmes: DirectoryProgramme[];
}

export interface SchoolOfferings {
  schoolId: string;
  levels: Array<{ code: string; name: string; qualifier: string | null; sourceToken: string | null }>;
  programmes: Array<DirectoryProgramme & { sourceToken: string | null }>;
}

export interface PutSchoolOfferingsInput {
  levels: Array<{ code: string; qualifier?: string }>;
  programmes: Array<{ id: string }>;
  reason?: string;
}
