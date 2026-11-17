/**
 * Teacher–student access (owner approvals TS-1…TS-6, 2026-11-18): the words and small rules the School Access page,
 * the teacher card and My Students share. The backend decides everything (who a teacher sees, what a delegation
 * covers); these helpers only describe its answers. Pure; tested in tests/teacher-student-access.test.mjs.
 */
import type { BackendDetection } from "../api/capabilities";

export type StudentScope = "SCHOOL" | "ASSIGNED" | "SELECTED";
export const STUDENT_SCOPES: readonly StudentScope[] = ["SCHOOL", "ASSIGNED", "SELECTED"];

export type ItemOutcome = "ASSIGNED" | "REACTIVATED" | "ENDED" | "ADDED" | "REMOVED" | "SKIPPED" | "FAILED";
export interface ItemResult {
  studentId: string;
  outcome: ItemOutcome;
  code?: string;
  message?: string;
  id?: string;
}

/** Backends with teacherStudentAccess: assignments, School Access, delegation scopes. */
export function teacherStudentAccessSupported(d: BackendDetection | undefined): boolean {
  return !!d && d.state === "NEW" && d.features.includes("teacherStudentAccess");
}

export const SCOPE_LABEL: Record<StudentScope, string> = {
  SCHOOL: "All students of the teacher's schools",
  ASSIGNED: "Only students assigned to the teacher",
  SELECTED: "Only selected students",
};

/** "Only selected students (3)"; an older delegation without a scope is school-wide. */
export function scopeText(scope: StudentScope | null | undefined, selected?: number | null): string {
  const s = scope ?? "SCHOOL";
  return s === "SELECTED" && typeof selected === "number" ? `${SCOPE_LABEL.SELECTED} (${selected})` : SCOPE_LABEL[s];
}

const OUTCOME_WORD: Record<ItemOutcome, string> = {
  ASSIGNED: "assigned",
  REACTIVATED: "assigned again",
  ENDED: "ended",
  ADDED: "added",
  REMOVED: "removed",
  SKIPPED: "skipped",
  FAILED: "failed",
};
const ORDER: ItemOutcome[] = ["ASSIGNED", "REACTIVATED", "ADDED", "ENDED", "REMOVED", "SKIPPED", "FAILED"];

/** "2 assigned, 1 skipped, 1 failed" (zero counts left out); "Nothing changed." for an empty list. */
export function outcomeSummary(results: readonly Pick<ItemResult, "outcome">[]): string {
  const n = new Map<ItemOutcome, number>();
  for (const r of results) n.set(r.outcome, (n.get(r.outcome) ?? 0) + 1);
  const parts = ORDER.filter((o) => n.get(o)).map((o) => `${n.get(o)} ${OUTCOME_WORD[o]}`);
  return parts.length ? parts.join(", ") : "Nothing changed.";
}

/** Why one student was skipped or failed, in plain words. */
export const ITEM_CODE_TEXT: Record<string, string> = {
  ALREADY_ASSIGNED: "already assigned to this teacher",
  ALREADY_SET: "already covered",
  NOT_A_STUDENT: "not a student account",
  NOT_FOUND: "the account no longer exists",
  REASON_REQUIRED: "not a verified student of the teacher's schools — give a reason",
  STUDENT_NOT_IN_TEACHER_SCOPE: "the teacher does not see this student",
  NOT_ASSIGNED: "not assigned to that teacher",
  ASSIGNMENT_ENDED: "the assignment had already ended",
  NOT_APPLICABLE: "not covered by this permission",
};

export function itemText(r: Pick<ItemResult, "outcome" | "code" | "message">): string {
  if (r.outcome !== "SKIPPED" && r.outcome !== "FAILED") return OUTCOME_WORD[r.outcome];
  const why = (r.code && ITEM_CODE_TEXT[r.code]) || r.message || r.code || "";
  return why ? `${OUTCOME_WORD[r.outcome]}: ${why}` : OUTCOME_WORD[r.outcome];
}

/** Results that need the administrator's attention (failed ones), with the student's name when known. */
export function problemLines(results: readonly ItemResult[], nameOf: (id: string) => string | undefined): string[] {
  return results.filter((r) => r.outcome === "FAILED").map((r) => `${nameOf(r.studentId) ?? r.studentId} — ${itemText(r)}`);
}

/** A student shown to a teacher: how they see them (badges) — absent on older backends. */
export function accessBadges(access: { school: boolean; assigned: boolean } | undefined): string[] {
  if (!access) return [];
  return [...(access.school ? ["School"] : []), ...(access.assigned ? ["Assigned to you"] : [])];
}

export type TeacherAbility = "viewProfile" | "viewProgress" | "submitOnBehalf";
export const ABILITY_LABEL: Record<TeacherAbility, string> = {
  viewProfile: "Profile",
  viewProgress: "Progress",
  submitOnBehalf: "Submit for",
};

/** What the teacher may do for this student, from the backend's `can` (null = older backend: use the session). */
export function abilities(can: Partial<Record<TeacherAbility, boolean>> | undefined): TeacherAbility[] | null {
  if (!can) return null;
  return (Object.keys(ABILITY_LABEL) as TeacherAbility[]).filter((k) => can[k]);
}

/** "3 students of your schools are waiting for an administrator to verify their school." — null when none. */
export function pendingText(n: number | undefined): string | null {
  if (!n) return null;
  return n === 1
    ? "1 student of your schools is waiting for an administrator to verify their school. They will appear here once verified."
    : `${n} students of your schools are waiting for an administrator to verify their school. They will appear here once verified.`;
}

/** Reasons: optional unless a student outside the teacher's verified schools is involved (then ≥ 5 characters). */
export const ASSIGN_REASON = { min: 5, max: 500 };
export function assignReasonProblem(reason: string, required: boolean): string | null {
  const r = reason.trim();
  if (!r) return required ? `Give a reason (at least ${ASSIGN_REASON.min} characters): some students are not verified students of the teacher's schools.` : null;
  if (r.length < ASSIGN_REASON.min || r.length > ASSIGN_REASON.max) return `The reason must be ${ASSIGN_REASON.min}–${ASSIGN_REASON.max} characters.`;
  return null;
}

/** Most students one request may name (the backend's limit). */
export const MAX_STUDENTS_PER_REQUEST = 200;

/** The three teacher delegations, in the administrators' words. */
export const DELEGATION_LABEL: Record<string, string> = {
  "students.viewProfile": "View student profiles",
  "students.viewProgress": "View student progress and submissions",
  "submissions.submitOnBehalf": "Submit work on a student's behalf",
};
