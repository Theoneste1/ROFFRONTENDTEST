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

/**
 * Course homework by teachers, by default (owner 2026-11-24, capability teacherHomeworkDefault): seeing a student's
 * homework progress and handing homework in for them are every teacher's defaults, switched off per teacher by an
 * Administrator — no longer delegations to offer.
 */
export const HOMEWORK_DEFAULT_PERMISSIONS = ["students.viewProgress", "submissions.submitOnBehalf"] as const;

export function homeworkDefaultSupported(d: BackendDetection | null | undefined): boolean {
  return !!d && d.state === "NEW" && d.features.includes("teacherHomeworkDefault");
}

/**
 * The delegations an Administrator may still give: all three on an older backend; only the profile once course homework
 * is a default. Existing delegations stay listed (and revocable) either way.
 */
export function offeredDelegations<P extends string>(all: readonly P[], d: BackendDetection | null | undefined): P[] {
  if (!homeworkDefaultSupported(d)) return [...all];
  return all.filter((p) => !(HOMEWORK_DEFAULT_PERMISSIONS as readonly string[]).includes(p));
}

/** A delegation that adds nothing any more (its permission is a teacher default): said beside it, so it can be revoked. */
export function delegationNote(permission: string, d: BackendDetection | null | undefined): string | null {
  return homeworkDefaultSupported(d) && (HOMEWORK_DEFAULT_PERMISSIONS as readonly string[]).includes(permission)
    ? "Every teacher has this now (course homework). This older permission adds nothing and can be revoked."
    : null;
}

/** The three teacher delegations, in the administrators' words. */
export const DELEGATION_LABEL: Record<string, string> = {
  "students.viewProfile": "View student profiles",
  "students.viewProgress": "View student progress and submissions",
  "submissions.submitOnBehalf": "Submit work on a student's behalf",
};

/**
 * The students a 400 STUDENT_NOT_IN_TEACHER_SCOPE refused (`details.studentIds`), or null when the error is not that
 * refusal. Giving a SELECTED delegation is all-or-nothing on the backend: one unseen student refuses the whole request.
 */
export function refusedStudentIds(e: unknown): string[] | null {
  if (!e || typeof e !== "object") return null;
  const { status, code, details } = e as { status?: unknown; code?: unknown; details?: unknown };
  if (status !== 400 || code !== "STUDENT_NOT_IN_TEACHER_SCOPE") return null;
  const ids = details && typeof details === "object" ? (details as { studentIds?: unknown }).studentIds : undefined;
  return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : null;
}

const NOT_SEEN = { outcome: "FAILED" as const, code: "STUDENT_NOT_IN_TEACHER_SCOPE", message: "The teacher does not see this student." };

/**
 * Give a new SELECTED delegation for `ids` with real per-student results: the students the backend refuses (not seen by
 * the teacher) are reported FAILED and the permission is given again for the rest, if any (a few attempts at most, as
 * what the teacher sees can change in between). Any other error before anything was refused is thrown; after a
 * refusal it is reported on the remaining students.
 */
export async function grantSelected(
  ids: readonly string[],
  grant: (studentIds: string[]) => Promise<unknown>,
  errorText: (e: unknown) => string,
  maxAttempts = 3,
): Promise<ItemResult[]> {
  const failed: ItemResult[] = [];
  let remaining = [...ids];
  for (let attempt = 1; remaining.length > 0; attempt++) {
    try {
      await grant(remaining);
      return [...failed, ...remaining.map((studentId) => ({ studentId, outcome: "ADDED" as const }))];
    } catch (e) {
      const refused = refusedStudentIds(e);
      const hit = refused ? remaining.filter((id) => refused.includes(id)) : [];
      if (hit.length === 0 || attempt >= maxAttempts) {
        if (failed.length === 0 && hit.length === 0) throw e;
        failed.push(...hit.map((studentId) => ({ studentId, ...NOT_SEEN })));
        const rest = remaining.filter((id) => !hit.includes(id));
        const why = hit.length ? "Not given: the teacher's students changed while this was running. Try again." : errorText(e);
        return [...failed, ...rest.map((studentId) => ({ studentId, outcome: "FAILED" as const, message: why }))];
      }
      failed.push(...hit.map((studentId) => ({ studentId, ...NOT_SEEN })));
      remaining = remaining.filter((id) => !hit.includes(id));
    }
  }
  return failed;
}
