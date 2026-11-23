/**
 * Coaches across their programmes (capability coachProgrammeAccess, owner 2026-11-23). By default every Coach, in each
 * programme they belong to and at every level:
 *   STUDENTS  sees the programme's students (the coach's Students page),
 *   COURSES   opens and manages every course of the programme,
 *   MARKING   marks the programme's tests (marking stays blind and assigned),
 *   RESULTS   sees the programme's published test results (the coach's Results pages).
 * An Administrator, or the programme's Head Coach, takes any part away per coach and programme — with a reason — and gives
 * it back. The backend enforces everything; this module only calls it and words it. Tested in tests/coach-access.test.mjs.
 */
import { api } from "../api/client";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import type { Page } from "../api/types";

export type CoachCapability = "STUDENTS" | "COURSES" | "MARKING" | "RESULTS";
export const COACH_CAPABILITIES: readonly CoachCapability[] = ["STUDENTS", "COURSES", "MARKING", "RESULTS"];

/** In plain words, for the switches. */
export const CAPABILITY_TEXT: Readonly<Record<CoachCapability, { label: string; hint: string }>> = {
  STUDENTS: { label: "See the programme's students", hint: "Every level; names, level, school and subjects — never contact details." },
  COURSES: { label: "Open and manage every course", hint: "Resources, assignments and discussions of every course of the programme, at every level." },
  MARKING: { label: "Mark the programme's tests", hint: "Answers are still handed out by the Head Coach, and marking stays anonymous." },
  RESULTS: { label: "See published test results", hint: "Published results only — never a rank, an unpublished mark or who marked." },
};

export interface Person { id: string; firstName: string; lastName: string }

export interface CoachAccess {
  coach: Person;
  programmes: Array<{
    programme: { id: string; code: string; name: string };
    access: Array<{ capability: CoachCapability; allowed: boolean; removed: { id: string; reason: string; at: string; by: Person | null } | null }>;
  }>;
  history: Array<{
    id: string; disciplineId: string; capability: CoachCapability; reason: string; createdAt: string; createdBy: Person | null;
    liftedAt: string | null; liftedBy: Person | null; liftReason: string | null;
  }>;
}

export interface CoachStudent {
  id: string; firstName: string; lastName: string; username: string; avatarUrl: string | null; gradeLevel: string | null;
  division: { code: string; name: string } | null; school: { id: string; name: string } | null;
  olympiadInterests: string[]; olympiadInterestOther: string | null; programmes: Array<{ id: string; name: string }>;
}

export interface CoachStudentsPage extends Page<CoachStudent> {
  programmes: Array<{ id: string; code: string; name: string }>;
}

const enc = encodeURIComponent;

export const coachAccessApi = {
  get: (coachId: string) => api<CoachAccess>(`/admin/coaches/${enc(coachId)}/programme-access`),
  set: (coachId: string, body: { programmeId: string; capability: CoachCapability; allowed: boolean; reason?: string }) =>
    api<CoachAccess>(`/admin/coaches/${enc(coachId)}/programme-access`, { method: "PUT", body }),
  students: (q: { q?: string; programmeId?: string; division?: string; page?: number; limit?: number } = {}) =>
    api<CoachStudentsPage>("/coach/students", { query: { ...q } }),
};

export const STUDENTS_VIEW_PROGRAMME = "students.viewProgramme";
export const TESTS_VIEW_PROGRAMME_RESULTS_PERMISSION = "tests.viewProgrammeResults";

export function coachProgrammeAccessSupported(detection: BackendDetection | null | undefined): boolean {
  return hasFeature(detection, "coachProgrammeAccess");
}

/** The coach's Students / Results menu entries: the backend feature and the known permission. */
export function coachNavVisible(detection: BackendDetection | null | undefined, permissions: ReadonlySet<string> | null, permission: string): boolean {
  return coachProgrammeAccessSupported(detection) && !!permissions && permissions.has(permission);
}

/** A reason to take something away: 3–500 characters, as the backend checks. */
export function removalReasonProblem(reason: string): string | undefined {
  const r = reason.trim();
  if (r.length < 3) return "Give a reason (at least 3 characters) — the coach's Head Coach and the administrators will see it.";
  if (r.length > 500) return "Keep the reason under 500 characters.";
  return undefined;
}

/** "Taken away by Jane Doe on 23 Nov 2026: reason". */
export function removedText(removed: { reason: string; at: string; by: Person | null }, formatDate: (iso: string) => string): string {
  const who = removed.by ? `${removed.by.firstName} ${removed.by.lastName}`.trim() : "an administrator";
  return `Taken away by ${who} on ${formatDate(removed.at)}: ${removed.reason}`;
}
