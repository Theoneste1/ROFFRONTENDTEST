/**
 * A student's Olympiad level (capability olympiadLevels, owner 2026-11-21/22). The level is the student's division —
 * Junior, Middle, Senior or one an Administrator created. It follows the grade (the division the grade is suggested
 * for) until an authorised person sets it by hand with a reason; "follow the grade" returns it to automatic. Every
 * change is kept with who made it and when. `GET` / `PUT /admin/students/:id/olympiad-level` (students.classifyLevel:
 * Administrators and User Managers everywhere, Coaches and Head Coaches for their programmes' students).
 * Pure helpers tested in tests/olympiad-level.test.mjs.
 */
import { api } from "../api/client";
import type { GradeLevel } from "../api/types";

export interface LevelRef {
  id: string;
  code: string;
  name: string;
}

export type LevelChangeSource = "GRADE" | "MANUAL" | "AUTOMATIC" | "SYSTEM";

export interface LevelChange {
  id: string;
  gradeLevel: GradeLevel | null;
  source: LevelChangeSource;
  reason: string | null;
  createdAt: string;
  fromDivision: LevelRef | null;
  toDivision: LevelRef | null;
  changedBy: { id: string; username: string; firstName: string; lastName: string } | null;
}

export interface OlympiadLevelView {
  studentId: string;
  gradeLevel: GradeLevel | null;
  level: LevelRef | null;
  /** True when set by hand (it no longer follows the grade). */
  manual: boolean;
  suggestedLevel: LevelRef | null;
  choices: LevelRef[];
  history: LevelChange[];
}

export type SetLevelInput = { divisionId: string; reason: string } | { automatic: true; reason: string };

export const LEVEL_REASON = { min: 3, max: 500 } as const;

export const olympiadLevelApi = {
  view: (studentId: string) => api<OlympiadLevelView>(`/admin/students/${studentId}/olympiad-level`),
  set: (studentId: string, input: SetLevelInput) =>
    api<OlympiadLevelView>(`/admin/students/${studentId}/olympiad-level`, { method: "PUT", body: input }),
};

/** What the change was, in words. */
export function changeText(c: Pick<LevelChange, "source" | "fromDivision" | "toDivision"> & { gradeLevel?: GradeLevel | null }): string {
  const to = c.toDivision?.name ?? "no level";
  const move = c.fromDivision && c.fromDivision.id !== c.toDivision?.id ? `${c.fromDivision.name} → ${to}` : to;
  switch (c.source) {
    case "MANUAL":
      return `${move} (set by hand)`;
    case "AUTOMATIC":
      return `${move} (follows the grade again)`;
    case "GRADE":
      return `${move} (grade ${c.gradeLevel ?? "changed"})`;
    default:
      return `${move} (system)`;
  }
}

export function changedByText(c: Pick<LevelChange, "changedBy" | "source">): string {
  if (c.changedBy) return `${c.changedBy.firstName} ${c.changedBy.lastName} (@${c.changedBy.username})`;
  return c.source === "GRADE" ? "automatic, from the grade" : "system";
}

/** "Middle — set by hand" / "Junior — follows grade S2". */
export function levelSummary(v: Pick<OlympiadLevelView, "level" | "manual" | "gradeLevel">): string {
  if (!v.level) return "Not set";
  return v.manual ? `${v.level.name} — set by hand` : `${v.level.name} — follows grade ${v.gradeLevel ?? "—"}`;
}

/** The problem with a requested change, or undefined. `choice` is a division id or AUTOMATIC. */
export function levelChangeProblem(v: Pick<OlympiadLevelView, "level" | "manual" | "suggestedLevel">, choice: string, reason: string): string | undefined {
  if (!choice) return "Choose a level.";
  if (choice === "AUTOMATIC") {
    if (!v.suggestedLevel) return "The student's grade suggests no level: choose one.";
    if (!v.manual) return "The level already follows the grade.";
  } else if (v.manual && v.level?.id === choice) return "This level is already set.";
  const r = reason.trim();
  if (r.length < LEVEL_REASON.min || r.length > LEVEL_REASON.max) return `Give a reason of ${LEVEL_REASON.min}–${LEVEL_REASON.max} characters.`;
  return undefined;
}

export function setLevelInput(choice: string, reason: string): SetLevelInput {
  return choice === "AUTOMATIC" ? { automatic: true, reason: reason.trim() } : { divisionId: choice, reason: reason.trim() };
}
