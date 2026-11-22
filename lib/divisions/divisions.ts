/**
 * Divisions = Olympiad levels (backend capability `adminDivisions`, owner 2026-11-22): Junior, Middle, Senior or any
 * division an Administrator creates. Nothing here is fixed to three: names, order, suggested grades and whether a
 * division is active all come from `GET /divisions`. These helpers turn a division code into its label and build the
 * choices screens offer; when the list has not loaded yet (or an older backend answers) they fall back to the codes.
 */
import type { GradeLevel } from "../api/types";

export interface DivisionInfo {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  /** The grades this division is suggested for (older backends: `gradeLevels`). */
  suggestedGrades?: GradeLevel[];
  gradeLevels?: GradeLevel[];
  sortOrder?: number;
}

export const ALL_LEVELS = "ALL";

/** Built-in names used until the list has loaded. */
const FALLBACK: Record<string, string> = { ALL: "All", JUNIOR: "Junior", MIDDLE: "Middle", SENIOR: "Senior", UNKNOWN: "Unknown" };

/** "ADVANCED_2" → "Advanced 2". */
function titleCase(code: string): string {
  return code.toLowerCase().split("_").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

/** The label of a division code (or ALL / UNKNOWN) from the loaded divisions. */
export function divisionLabel(code: string | null | undefined, divisions: readonly DivisionInfo[] | undefined): string {
  if (!code) return "—";
  return divisions?.find((d) => d.code === code)?.name ?? FALLBACK[code] ?? titleCase(code);
}

/** The grades of a division, as "S1–S3" (consecutive) or "S1, S4" (otherwise); "" when none. */
export function gradesText(grades: readonly string[] | undefined): string {
  const g = [...(grades ?? [])].sort();
  if (!g.length) return "";
  const n = g.map((x) => Number(x.slice(1)));
  const consecutive = n.every((v, i) => i === 0 || v === n[i - 1] + 1);
  return consecutive && g.length > 1 ? `${g[0]}–${g[g.length - 1]}` : g.join(", ");
}

/** The suggested grades of a division (new field, or the older `gradeLevels`). */
export function suggestedGrades(d: DivisionInfo): GradeLevel[] {
  return d.suggestedGrades ?? d.gradeLevels ?? [];
}

/** Active divisions in display order. */
export function activeDivisions(divisions: readonly DivisionInfo[] | undefined): DivisionInfo[] {
  return [...(divisions ?? [])].filter((d) => d.isActive).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.code.localeCompare(b.code));
}

/** "Junior (S1–S3)", or just "Middle" when it is suggested for no grade. */
export function divisionOptionLabel(d: DivisionInfo): string {
  const g = gradesText(suggestedGrades(d));
  return g ? `${d.name} (${g})` : d.name;
}

/** The choices for a test's level: ALL first, then every active division. */
export function testLevelOptions(divisions: readonly DivisionInfo[] | undefined): Array<{ value: string; label: string }> {
  return [{ value: ALL_LEVELS, label: "All levels" }, ...activeDivisions(divisions).map((d) => ({ value: d.code, label: divisionOptionLabel(d) }))];
}

/** Every grade S1–S6 must be suggested by exactly one active division (as the backend checks). */
export function coverageProblems(divisions: ReadonlyArray<Pick<DivisionInfo, "code" | "isActive"> & { grades: readonly string[] }>): string[] {
  const out: string[] = [];
  for (const g of ["S1", "S2", "S3", "S4", "S5", "S6"]) {
    const holders = divisions.filter((d) => d.isActive && d.grades.includes(g)).map((d) => d.code);
    if (holders.length === 0) out.push(`${g} is suggested by no active division`);
    if (holders.length > 1) out.push(`${g} is suggested by more than one active division (${holders.join(", ")})`);
  }
  return out;
}

/** A new division's code: 2–30 capitals, digits or underscores, starting with a letter; never ALL. */
export function divisionCodeProblem(code: string): string | undefined {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(c)) return "Use 2–30 letters, digits or underscores, starting with a letter (for example ADVANCED).";
  if (c === "ALL") return "ALL is reserved.";
  return undefined;
}
