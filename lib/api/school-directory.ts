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
 *
 * Use these only when the backend advertises `schoolAdministration` AND the user holds
 * `schools.manage` (lib/admin/school-directory.ts → schoolDirectoryMode). Not to be confused with
 * `schoolDirectoryApi` in lib/api/accounts.ts (the public search and locations).
 */
import { api, type QueryValue } from "./client";
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
  createdBy: { id: string; username: string } | null;
}

/** `GET /admin/schools` item. */
export interface DirectorySchoolRow extends DirectorySchoolRecord {
  students: number;
  verifiedStudents: number;
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
};
