/**
 * Custom reports (capability customReports, owner 2026-11-22). An Administrator (reports.build) builds a report — a
 * name, a source (students, coaches, teachers, every user), the columns in order, filters and a sort — previews it on
 * live data, saves it, runs it again later and exports it to CSV or Excel. A report is shared with chosen users or
 * roles at independent levels: View, Download, Edit ("All" = the three). The backend enforces every level and keeps
 * each viewer to the rows they may see (a coach: their students; a teacher: their school's); sensitive fields (phones,
 * family contacts, date of birth) are never offered. Pure helpers tested in tests/custom-reports.test.mjs.
 */
import { api, apiBlob, type DownloadedFile } from "../api/client";
import type { Page, Permission, Role } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";

export type FieldType = "text" | "enum" | "date" | "boolean" | "list" | "number";
export type FilterOp = "eq" | "neq" | "in" | "contains" | "gte" | "lte" | "isEmpty" | "isNotEmpty";

export interface ReportField {
  key: string;
  label: string;
  type: FieldType;
  values: string[] | null;
  filterable: boolean;
  sortable: boolean;
  /** Personal data (newer backends): only the Super Admin is offered it; anyone else sees it blank. */
  protected?: boolean;
}
/** The data groups of the builder's "Data" picker (newer backends send `group`). */
export const SOURCE_GROUPS = ["People", "Schools", "Learning", "Applications", "Administration"] as const;
export interface ReportSource {
  key: string;
  label: string;
  fields: ReportField[];
  group?: (typeof SOURCE_GROUPS)[number];
  /** Only the Super Admin may use it (e.g. banking information). */
  superAdminOnly?: boolean;
}
export interface ReportCatalogue {
  sources: ReportSource[];
  operators: FilterOp[];
}

export interface ReportFilter {
  field: string;
  op: FilterOp;
  value?: unknown;
}
export interface ReportSort {
  field: string;
  dir: "asc" | "desc";
}
export interface ReportDefinition {
  source: string;
  columns: string[];
  filters: ReportFilter[];
  sort: ReportSort[];
}
export interface ReportLevels {
  view: boolean;
  download: boolean;
  edit: boolean;
  /** The creator or a builder: share, delete. */
  manage: boolean;
}
export interface CustomReport extends ReportDefinition {
  id: string;
  name: string;
  description: string | null;
  createdBy: { id: string; firstName: string; lastName: string; username: string } | null;
  createdAt: string;
  updatedAt: string;
  myAccess: ReportLevels;
  /** A template every Administrator may start from (newer backends); only the Super Admin changes it. */
  isTemplate?: boolean;
}
export interface ReportPage {
  report?: { id: string; name: string };
  columns: Array<{ key: string; label: string }>;
  rows: Array<Array<string | number | boolean | null>>;
  meta: Page<unknown>["meta"];
}
export interface ReportGrant {
  id?: string;
  role: Role | null;
  user: { id: string; firstName: string; lastName: string; username: string; role: Role } | null;
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
}
export interface GrantInput {
  userId?: string;
  role?: Role;
  canView: boolean;
  canDownload: boolean;
  canEdit: boolean;
}

export type SaveReportInput = ReportDefinition & { name: string; description?: string; /** The Super Admin only. */ isTemplate?: boolean };

const enc = encodeURIComponent;
export const customReportsApi = {
  catalogue: () => api<ReportCatalogue>("/reports/sources"),
  list: () => api<CustomReport[]>("/reports"),
  get: (id: string) => api<CustomReport>(`/reports/${enc(id)}`),
  create: (input: SaveReportInput) => api<CustomReport>("/reports", { method: "POST", body: input }),
  update: (id: string, input: SaveReportInput) => api<CustomReport>(`/reports/${enc(id)}`, { method: "PUT", body: input }),
  remove: (id: string) => api<{ id: string; deleted: true }>(`/reports/${enc(id)}`, { method: "DELETE" }),
  preview: (d: ReportDefinition, page = 1) => api<ReportPage>("/reports/preview", { method: "POST", body: d, query: { page, limit: 25 } }),
  previewFor: (id: string, d: ReportDefinition, page = 1) => api<ReportPage>(`/reports/${enc(id)}/preview`, { method: "POST", body: d, query: { page, limit: 25 } }),
  run: (id: string, page = 1) => api<ReportPage>(`/reports/${enc(id)}/run`, { query: { page, limit: 50 } }),
  export: (id: string, format: "csv" | "xlsx"): Promise<DownloadedFile> => apiBlob(`/reports/${enc(id)}/export`, { query: { format } }, `report.${format}`),
  grants: (id: string) => api<{ report: { id: string; name: string }; grants: ReportGrant[] }>(`/reports/${enc(id)}/grants`),
  setGrants: (id: string, grants: GrantInput[]) => api<{ report: { id: string; name: string }; grants: ReportGrant[] }>(`/reports/${enc(id)}/grants`, { method: "PUT", body: { grants } }),
};

/** The menu entry: the backend feature, and for builders the known reports.build. */
export function customReportsNavVisible(detection: BackendDetection | null | undefined, known: ReadonlySet<Permission> | readonly Permission[] | null | undefined, needsBuild: boolean): boolean {
  if (!hasFeature(detection, "customReports")) return false;
  if (!needsBuild) return true;
  const list = known ? (Array.isArray(known) ? known : [...(known as ReadonlySet<Permission>)]) : [];
  return list.includes("reports.build");
}

export const OP_LABEL: Record<FilterOp, string> = {
  eq: "is",
  neq: "is not",
  in: "is one of",
  contains: "contains",
  gte: "on or after",
  lte: "on or before",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

/** The conditions offered for a field (the backend accepts these for its type). */
export function opsFor(field: Pick<ReportField, "type" | "key">): FilterOp[] {
  if (field.key === "fullName") return ["contains"];
  if (field.key === "olympiadLevel") return ["eq", "in"];
  if (field.key === "school") return ["contains", "eq", "isEmpty", "isNotEmpty"];
  if (field.key === "province" || field.key === "district") return ["eq", "contains"];
  switch (field.type) {
    case "text":
      return ["contains", "eq", "neq", "isEmpty", "isNotEmpty"];
    case "enum":
      return ["eq", "neq", "in", "isEmpty", "isNotEmpty"];
    case "date":
      return ["gte", "lte", "isEmpty", "isNotEmpty"];
    case "boolean":
      return ["eq"];
    case "list":
      return ["in", "eq", "isEmpty"];
    case "number":
      return ["eq", "gte", "lte", "isEmpty", "isNotEmpty"];
  }
}

export function needsValue(op: FilterOp): boolean {
  return op !== "isEmpty" && op !== "isNotEmpty";
}

/** Problems of a definition before it is sent (empty: fine). The backend checks again. */
export function definitionProblems(d: ReportDefinition, source: ReportSource | undefined): string[] {
  if (!source) return ["Choose what the report lists."];
  const out: string[] = [];
  if (!d.columns.length) out.push("Choose at least one column.");
  if (d.columns.length > 40) out.push("Choose at most 40 columns.");
  for (const f of d.filters) {
    const def = source.fields.find((x) => x.key === f.field);
    if (!def?.filterable) out.push(`${def?.label ?? f.field} cannot be filtered.`);
    else if (needsValue(f.op) && (f.value === undefined || f.value === "" || (Array.isArray(f.value) && f.value.length === 0))) out.push(`Give a value for “${def.label} ${OP_LABEL[f.op]}”.`);
  }
  for (const s of d.sort) if (!source.fields.find((x) => x.key === s.field)?.sortable) out.push(`${s.field} cannot be sorted.`);
  return out;
}

export function saveProblems(name: string): string | undefined {
  const n = name.trim();
  return n.length < 2 || n.length > 120 ? "Give the report a name of 2–120 characters." : undefined;
}

/** "All" = View + Download + Edit; Download or Edit include View. */
export function normaliseLevels(l: { canView: boolean; canDownload: boolean; canEdit: boolean }): { canView: boolean; canDownload: boolean; canEdit: boolean } {
  return { canView: l.canView || l.canDownload || l.canEdit, canDownload: l.canDownload, canEdit: l.canEdit };
}
export function levelsText(l: { canView: boolean; canDownload: boolean; canEdit: boolean }): string {
  const n = normaliseLevels(l);
  if (n.canView && n.canDownload && n.canEdit) return "All";
  return [n.canView && "View", n.canDownload && "Download", n.canEdit && "Edit"].filter(Boolean).join(", ") || "No access";
}

/** Grants as the PUT body: one user or one role each, levels normalised, entries without any level dropped. */
export function grantInputs(grants: readonly ReportGrant[]): GrantInput[] {
  return grants
    .map((g) => ({ ...(g.user ? { userId: g.user.id } : { role: g.role as Role }), ...normaliseLevels(g) }))
    .filter((g) => g.canView || g.canDownload || g.canEdit);
}

/** Roles a report may be shared with (never students). */
export const SHAREABLE_ROLES: Array<{ value: Role; label: string }> = [
  { value: "ADMIN", label: "Administrators" },
  { value: "SUPER_ADMIN", label: "Super Administrators" },
  { value: "HEAD_COACH", label: "Head Coaches" },
  { value: "MENTOR", label: "Coaches" },
  { value: "TEACHER", label: "Teachers" },
];

/** A cell for display: dates as dates, booleans as Yes / No, empty as —. */
export function cellText(v: string | number | boolean | null, type?: FieldType): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (type === "date" && typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toISOString().slice(0, 10);
  }
  return String(v);
}

/** Ready-made starting points (the owner's examples). */
export const REPORT_TEMPLATES: Array<{ name: string; description: string; definition: ReportDefinition }> = [
  { name: "Students by school", description: "Every student with their school, grade and level.", definition: { source: "STUDENTS", columns: ["fullName", "school", "district", "province", "grade", "olympiadLevel"], filters: [], sort: [{ field: "school", dir: "asc" }] } },
  { name: "Students by Olympiad level and subject", description: "Level and subjects of every student.", definition: { source: "STUDENTS", columns: ["fullName", "olympiadLevel", "subjects", "grade", "school"], filters: [], sort: [{ field: "olympiadLevel", dir: "asc" }] } },
  { name: "Recently registered", description: "Accounts created in the last 30 days.", definition: { source: "USERS", columns: ["fullName", "email", "role", "registeredAt"], filters: [{ field: "registeredAt", op: "gte", value: "" }], sort: [{ field: "registeredAt", dir: "desc" }] } },
  { name: "Never logged in", description: "Accounts that have never signed in.", definition: { source: "USERS", columns: ["fullName", "email", "role", "registeredAt"], filters: [{ field: "neverLoggedIn", op: "eq", value: true }], sort: [{ field: "registeredAt", dir: "desc" }] } },
  { name: "Last login", description: "Every account with its last sign-in, most recent first.", definition: { source: "USERS", columns: ["fullName", "role", "lastLoginAt"], filters: [], sort: [{ field: "lastLoginAt", dir: "desc" }] } },
  { name: "Coaches and their courses", description: "Each coach with the courses and divisions they teach.", definition: { source: "COACHES", columns: ["fullName", "role", "subjects", "coachCourses", "coachAssignments"], filters: [], sort: [{ field: "lastName", dir: "asc" }] } },
];

/** A template ready to preview: "Recently registered" gets today's date minus 30 days. */
export function templateDefinition(t: (typeof REPORT_TEMPLATES)[number], now: Date): ReportDefinition {
  const d = structuredClone(t.definition);
  for (const f of d.filters) if (f.field === "registeredAt" && f.op === "gte" && f.value === "") f.value = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  return d;
}
