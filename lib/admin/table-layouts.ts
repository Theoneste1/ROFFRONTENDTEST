/**
 * Configurable user tables (capability tableLayouts, owner 2026-11-22). Administrators choose which columns the Users
 * list shows, in which order, and save it for themselves; an Administrator with settings.manage also sets the
 * organization's default. Each role tab has its own table (students show grade and Olympiad level, teachers their test
 * submission, …). The username is hidden by default — the full name identifies a user. Older backends: the built-in
 * layout, not saved. Pure helpers tested in tests/table-layouts.test.mjs.
 */
import { api } from "../api/client";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
}
export interface ColumnSetting {
  key: string;
  visible: boolean;
}
export interface TableLayout {
  table: string;
  columns: ColumnSetting[];
  /** Where the layout comes from: the caller's own, the organization's default, or the built-in one. */
  source: "USER" | "ORG" | "DEFAULT";
  orgDefault: ColumnSetting[];
  available: ColumnDef[];
}

export const tableLayoutsApi = {
  get: (table: string) => api<TableLayout>(`/me/table-layouts/${encodeURIComponent(table)}`),
  saveMine: (table: string, columns: ColumnSetting[]) => api<TableLayout>(`/me/table-layouts/${encodeURIComponent(table)}`, { method: "PUT", body: { columns } }),
  resetMine: (table: string) => api<TableLayout>(`/me/table-layouts/${encodeURIComponent(table)}`, { method: "DELETE" }),
  saveOrg: (table: string, columns: ColumnSetting[]) => api<TableLayout>(`/admin/table-layouts/${encodeURIComponent(table)}`, { method: "PUT", body: { columns } }),
  resetOrg: (table: string) => api<TableLayout>(`/admin/table-layouts/${encodeURIComponent(table)}`, { method: "DELETE" }),
};

const col = (key: string, label: string, defaultVisible: boolean): ColumnDef => ({ key, label, defaultVisible });
const COMMON_END = [col("accountStatus", "Account status", true), col("registeredAt", "Registration date", true), col("lastLoginAt", "Last login", true), col("username", "Username", false), col("country", "Country", false)];

/** The same catalogue as the backend (src/table-layouts/table-columns.ts), used before it answers or when it is older. */
export const BUILT_IN_TABLES: Readonly<Record<string, readonly ColumnDef[]>> = {
  "users.all": [col("name", "Full name", true), col("email", "Email", true), col("role", "Role", true), col("school", "School", true), ...COMMON_END],
  "users.students": [col("name", "Full name", true), col("email", "Email", true), col("school", "School", true), col("grade", "Grade", true), col("olympiadLevel", "Olympiad level", true), col("subjects", "Olympiad subjects", false), ...COMMON_END],
  "users.coaches": [col("name", "Full name", true), col("email", "Email", true), col("subjects", "Olympiad subjects", true), col("banking", "Banking information", true), ...COMMON_END],
  "users.headCoaches": [col("name", "Full name", true), col("email", "Email", true), col("subjects", "Olympiad subjects", true), col("banking", "Banking information", true), ...COMMON_END],
  "users.teachers": [col("name", "Full name", true), col("email", "Email", true), col("school", "School", true), col("testSubmission", "Test submission", true), col("banking", "Banking information", true), ...COMMON_END],
  "users.admins": [col("name", "Full name", true), col("email", "Email", true), col("role", "Role", true), ...COMMON_END],
};

/** The table of the Users list for its role filter. */
export function userTableFor(role: string | null | undefined): string {
  switch (role) {
    case "STUDENT":
      return "users.students";
    case "MENTOR":
      return "users.coaches";
    case "HEAD_COACH":
      return "users.headCoaches";
    case "TEACHER":
      return "users.teachers";
    case "ADMIN":
    case "SUPER_ADMIN":
      return "users.admins";
    default:
      return "users.all";
  }
}

export function builtInLayout(table: string): TableLayout {
  const available = [...(BUILT_IN_TABLES[table] ?? BUILT_IN_TABLES["users.all"])];
  const columns = available.map((c) => ({ key: c.key, visible: c.defaultVisible }));
  return { table, columns, source: "DEFAULT", orgDefault: columns, available };
}

/** The visible columns in order, with their labels (unknown keys dropped). */
export function visibleColumns(layout: Pick<TableLayout, "columns" | "available">): ColumnDef[] {
  return layout.columns.filter((c) => c.visible).flatMap((c) => layout.available.filter((a) => a.key === c.key));
}

/** Move a column one place up (-1) or down (+1). */
export function moveColumn(columns: readonly ColumnSetting[], key: string, by: -1 | 1): ColumnSetting[] {
  const i = columns.findIndex((c) => c.key === key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= columns.length) return [...columns];
  const out = [...columns];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Show or hide a column; the last visible column cannot be hidden. */
export function toggleColumn(columns: readonly ColumnSetting[], key: string): ColumnSetting[] {
  const target = columns.find((c) => c.key === key);
  if (target?.visible && columns.filter((c) => c.visible).length === 1) return [...columns];
  return columns.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c));
}

export function sameLayout(a: readonly ColumnSetting[], b: readonly ColumnSetting[]): boolean {
  return a.length === b.length && a.every((c, i) => c.key === b[i].key && c.visible === b[i].visible);
}

/** The backend sort of a column (GET /admin/users ?sort=), or undefined when the column cannot be sorted. */
export const USER_SORT_OF: Readonly<Record<string, string>> = {
  name: "name",
  email: "email",
  role: "role",
  grade: "grade",
  registeredAt: "registeredAt",
  lastLoginAt: "lastLoginAt",
};

export type SortOrder = "asc" | "desc";
/** Dates sort newest first on the first click, text A→Z. */
export function defaultOrder(sort: string): SortOrder {
  return sort === "registeredAt" || sort === "lastLoginAt" ? "desc" : "asc";
}
/** The next sort after a header click: a new column starts at its default order; the same column flips. */
export function nextSort(current: { sort?: string; order?: SortOrder }, clicked: string): { sort: string; order: SortOrder } {
  if (current.sort === clicked) return { sort: clicked, order: (current.order ?? defaultOrder(clicked)) === "asc" ? "desc" : "asc" };
  return { sort: clicked, order: defaultOrder(clicked) };
}
