/**
 * Registration data (capability registrationData, owner 2026-11-23): Super Administrators (registrationData.manage)
 * see, filter, sort, export and edit everything people entered when they registered. Nothing here is a hand-written
 * list of fields: the backend sends each category's fields (read from the database, through its eligibility layer —
 * security data never appears), their types, choices, conditions and how each one is edited. A field added to the
 * database later appears here without a frontend change.
 *
 * Pure helpers (the filter tree, values, checks) are tested in tests/registration-data.test.mjs.
 */
import { api, apiBlob, type DownloadedFile } from "../api/client";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { Page, Permission } from "../api/types";

export type CategoryKey = "STUDENTS" | "TEACHERS" | "COACHES" | "HEAD_COACHES" | "ADMINS" | "ALL";
export type FieldType = "text" | "number" | "date" | "datetime" | "boolean" | "enum" | "enumList" | "textList";
export type EditVia = "direct" | "account" | "status" | "dateOfBirth" | "olympiadLevel" | "none";
export type CellValue = string | number | boolean | string[] | null;

export interface RegistrationField {
  key: string;
  label: string;
  group: string;
  type: FieldType;
  values: string[] | null;
  valueLabels: Record<string, string> | null;
  nullable: boolean;
  integer: boolean;
  maxLength: number | null;
  personal: boolean;
  reference: "school" | "division" | null;
  editVia: EditVia;
  editable: boolean;
  filterable: boolean;
  sortable: boolean;
  operators: string[];
}

export interface OperatorInfo {
  label: string;
  needsValue: boolean;
  range: boolean;
}

export interface FieldCatalogue {
  category: CategoryKey;
  categories: Array<{ key: CategoryKey; label: string }>;
  fields: RegistrationField[];
  operators: Record<string, OperatorInfo>;
  defaultColumns: string[];
}

export interface FilterCondition {
  field: string;
  operator: string;
  value?: unknown;
  value2?: unknown;
}
export interface FilterGroup {
  combinator: "AND" | "OR";
  conditions: Array<FilterCondition | FilterGroup>;
}
export interface SortSpec {
  field: string;
  dir: "asc" | "desc";
}

export interface RegistrationQuery {
  category: CategoryKey;
  columns: string[];
  filter?: FilterGroup;
  sort?: SortSpec[];
  search?: string;
}

export interface QueryPage {
  category: CategoryKey;
  columns: Array<{ key: string; label: string; type: FieldType; valueLabels: Record<string, string> | null }>;
  rows: Array<{ id: string; version: string; values: Record<string, CellValue> }>;
  meta: Page<unknown>["meta"];
}

export interface RecordField extends Omit<RegistrationField, "operators" | "filterable" | "sortable"> {
  note: string | null;
  value: CellValue;
}
export interface RegistrationRecord {
  id: string;
  role: string;
  category: CategoryKey;
  version: string;
  name: string;
  hasCoachApplication: boolean;
  hasTeacherApplication: boolean;
  fields: RecordField[];
}

export interface SavedFilter {
  id: string;
  name: string;
  category: CategoryKey;
  filter: FilterGroup;
  columns: string[];
  sort: SortSpec[];
  shared: boolean;
  mine: boolean;
  owner: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface ColumnLayout {
  category: CategoryKey;
  columns: string[];
  source: "USER" | "DEFAULT";
  defaultColumns: string[];
}

const B = "/admin/registration-data";
const enc = encodeURIComponent;

export const registrationDataApi = {
  fields: (category: CategoryKey) => api<FieldCatalogue>(`${B}/fields`, { query: { category } }),
  query: (q: RegistrationQuery, page = 1, limit = 50) => api<QueryPage>(`${B}/query`, { method: "POST", body: cleanQuery(q), query: { page, limit } }),
  export: (q: RegistrationQuery, format: "csv" | "xlsx"): Promise<DownloadedFile> =>
    apiBlob(`${B}/export`, { method: "POST", body: cleanQuery(q), query: { format } }, `registration-data.${format}`),
  record: (id: string) => api<RegistrationRecord>(`${B}/users/${enc(id)}`),
  update: (id: string, changes: Record<string, unknown>, version?: string, currentPassword?: string) =>
    api<RegistrationRecord>(`${B}/users/${enc(id)}`, { method: "PATCH", body: { changes, ...(version && { version }), ...(currentPassword && { currentPassword }) } }),
  savedFilters: (category?: CategoryKey) => api<SavedFilter[]>(`${B}/saved-filters`, { query: category ? { category } : {} }),
  createFilter: (input: SaveFilterInput) => api<SavedFilter>(`${B}/saved-filters`, { method: "POST", body: input }),
  updateFilter: (id: string, input: SaveFilterInput) => api<SavedFilter>(`${B}/saved-filters/${enc(id)}`, { method: "PUT", body: input }),
  removeFilter: (id: string) => api<{ id: string; deleted: true }>(`${B}/saved-filters/${enc(id)}`, { method: "DELETE" }),
  layout: (category: CategoryKey) => api<ColumnLayout>(`${B}/layouts/${enc(category)}`),
  saveLayout: (category: CategoryKey, columns: string[]) => api<ColumnLayout>(`${B}/layouts/${enc(category)}`, { method: "PUT", body: { columns } }),
  resetLayout: (category: CategoryKey) => api<ColumnLayout>(`${B}/layouts/${enc(category)}`, { method: "DELETE" }),
};

export interface SaveFilterInput {
  name: string;
  category: CategoryKey;
  filter: FilterGroup;
  columns: string[];
  sort: SortSpec[];
  shared: boolean;
}

export const REGISTRATION_DATA_PERMISSION: Permission = "registrationData.manage";

/** The menu entry: the backend feature and the known registrationData.manage (Super Administrators). */
export function registrationDataNavVisible(detection: BackendDetection | null | undefined, permissions: ReadonlySet<string> | null | undefined): boolean {
  return hasFeature(detection, "registrationData") && !!permissions && permissions.has(REGISTRATION_DATA_PERMISSION);
}

// ─── The filter tree ───────────────────────────────────────────────────────────

export const MAX_DEPTH = 4;
export const MAX_CONDITIONS = 50;

export function isGroup(c: FilterCondition | FilterGroup): c is FilterGroup {
  return !!c && typeof c === "object" && "conditions" in c;
}

export function emptyGroup(combinator: "AND" | "OR" = "AND"): FilterGroup {
  return { combinator, conditions: [] };
}

/** A new condition on a field: its first condition, and an empty value of the right shape. */
export function newCondition(field: RegistrationField): FilterCondition {
  const operator = field.operators[0] ?? "isNotEmpty";
  return { field: field.key, operator, value: initialValue(field, operator) };
}

export function initialValue(field: Pick<RegistrationField, "type">, operator: string): unknown {
  if (["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(operator)) return undefined;
  if (field.type === "enum" || field.type === "enumList" || field.type === "textList") return [];
  return "";
}

/** A path is the list of indexes from the root group to a node. */
export type Path = number[];

/** A copy of the tree with the group at `path` changed by `fn`. */
export function updateGroup(root: FilterGroup, path: Path, fn: (g: FilterGroup) => FilterGroup): FilterGroup {
  if (!path.length) return fn(root);
  const [head, ...rest] = path;
  return { ...root, conditions: root.conditions.map((c, i) => (i === head && isGroup(c) ? updateGroup(c, rest, fn) : c)) };
}

export function addCondition(root: FilterGroup, path: Path, c: FilterCondition): FilterGroup {
  return updateGroup(root, path, (g) => ({ ...g, conditions: [...g.conditions, c] }));
}

export function addGroup(root: FilterGroup, path: Path, combinator: "AND" | "OR"): FilterGroup {
  if (path.length + 1 >= MAX_DEPTH) return root;
  return updateGroup(root, path, (g) => ({ ...g, conditions: [...g.conditions, emptyGroup(combinator)] }));
}

export function removeAt(root: FilterGroup, path: Path, index: number): FilterGroup {
  return updateGroup(root, path, (g) => ({ ...g, conditions: g.conditions.filter((_, i) => i !== index) }));
}

export function setCondition(root: FilterGroup, path: Path, index: number, c: FilterCondition): FilterGroup {
  return updateGroup(root, path, (g) => ({ ...g, conditions: g.conditions.map((x, i) => (i === index ? c : x)) }));
}

export function setCombinator(root: FilterGroup, path: Path, combinator: "AND" | "OR"): FilterGroup {
  return updateGroup(root, path, (g) => ({ ...g, combinator }));
}

export function countConditions(g: FilterGroup): number {
  return g.conditions.reduce((n, c) => n + (isGroup(c) ? countConditions(c) : 1), 0);
}

/** The tree as sent: empty groups dropped (a group with nothing in it filters nothing). */
export function pruneFilter(g: FilterGroup): FilterGroup {
  const conditions = g.conditions
    .map((c) => (isGroup(c) ? pruneFilter(c) : c))
    .filter((c) => !isGroup(c) || c.conditions.length > 0);
  return { combinator: g.combinator, conditions };
}

function cleanQuery(q: RegistrationQuery): RegistrationQuery {
  const filter = q.filter ? pruneFilter(q.filter) : undefined;
  return {
    category: q.category,
    columns: q.columns,
    ...(filter && filter.conditions.length && { filter }),
    ...(q.sort?.length && { sort: q.sort }),
    ...(q.search?.trim() && { search: q.search.trim() }),
  };
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

/**
 * Problems of a filter before it is sent, in plain words (the backend checks again): a condition without a value, a
 * range with one end, a number that is not one.
 */
export function filterProblems(g: FilterGroup, fields: readonly RegistrationField[], operators: Record<string, OperatorInfo>): string[] {
  const out: string[] = [];
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const walk = (grp: FilterGroup) => {
    for (const c of grp.conditions) {
      if (isGroup(c)) {
        walk(c);
        continue;
      }
      const f = byKey.get(c.field);
      if (!f) {
        out.push("A condition uses a field that is no longer available. Remove it.");
        continue;
      }
      const op = operators[c.operator];
      const name = `“${f.label} ${op?.label ?? c.operator}”`;
      if (op?.needsValue && isBlank(c.value)) out.push(`Give a value for ${name}.`);
      else if (op?.range && isBlank(c.value2)) out.push(`Give both ends of the range for ${name}.`);
      else if (f.type === "number" && op?.needsValue && [c.value, ...(op.range ? [c.value2] : [])].some((v) => !Number.isFinite(Number(v)))) out.push(`${name}: enter a number.`);
    }
  };
  walk(g);
  if (countConditions(g) > MAX_CONDITIONS) out.push(`A filter can have at most ${MAX_CONDITIONS} conditions.`);
  return out;
}

// ─── Values ────────────────────────────────────────────────────────────────────

/** A cell for display: choices in words, lists joined, yes / no, dates as dates, empty as —. */
export function cellText(v: CellValue | undefined, field: Pick<RegistrationField, "type" | "valueLabels">): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => field.valueLabels?.[x] ?? x).join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field.type === "datetime" && typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-GB", { timeZone: "Africa/Kigali", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  if (typeof v === "string" && field.valueLabels) return field.valueLabels[v] ?? v;
  return String(v);
}

/** The value a form control starts with. */
export function editValue(v: CellValue, field: Pick<RegistrationField, "type">): string | string[] | boolean {
  if (field.type === "enumList" || field.type === "textList") return Array.isArray(v) ? v : [];
  if (field.type === "boolean") return v === true;
  if (v === null || v === undefined) return "";
  if (field.type === "datetime" && typeof v === "string") return v.slice(0, 16);
  return String(v);
}

/** Only what changed, as the API takes it (a list in its own order compared as a set). */
export function changedValues(fields: readonly Pick<RecordField, "key" | "type" | "value">[], edited: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (!(f.key in edited)) continue;
    const next = edited[f.key];
    const before = editValue(f.value, f);
    const same = Array.isArray(next) && Array.isArray(before) ? [...next].sort().join("\u0000") === [...before].sort().join("\u0000") : next === before;
    if (same) continue;
    out[f.key] = f.type === "datetime" && typeof next === "string" && next ? new Date(next).toISOString() : next;
  }
  return out;
}

/** Fields grouped for the form and the chooser, in the backend's order. */
export function groupFields<T extends { group: string }>(fields: readonly T[]): Array<{ group: string; fields: T[] }> {
  const out: Array<{ group: string; fields: T[] }> = [];
  for (const f of fields) {
    const g = out.find((x) => x.group === f.group);
    if (g) g.fields.push(f);
    else out.push({ group: f.group, fields: [f] });
  }
  return out;
}

/** Columns kept to those the category still offers (a field may have been removed since a layout was saved). */
export function knownColumns(columns: readonly string[], fields: readonly Pick<RegistrationField, "key">[]): string[] {
  const keys = new Set(fields.map((f) => f.key));
  return columns.filter((c, i) => keys.has(c) && columns.indexOf(c) === i);
}

export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= list.length) return [...list];
  const out = [...list];
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

export function saveFilterProblem(name: string): string | undefined {
  const n = name.trim();
  return n.length < 2 || n.length > 120 ? "Give the filter a name of 2–120 characters." : undefined;
}
