/**
 * Application details and "request more information" (capability `applicationDetails`; backend ADR-009):
 * - Teacher applications: position (required here) and years of experience (optional);
 * - Coach applications: phone (required here), affiliation (optional), areas of expertise and relevant experience
 *   (required here), years of experience (optional); a rejection reason, e-mailed to the applicant;
 * - Administrators ask the applicant a question; the application stays PENDING; the applicant answers through a
 *   one-time link (`/applications/respond?token=…`) and may correct some details.
 * Older backends: none of this is shown or sent. Pure rules; tested in tests/application-details.test.mjs.
 */
import { api } from "../api/client";
import { hasFeature, type BackendDetection } from "../api/capabilities";

export const applicationDetailsSupported = (d: BackendDetection | null | undefined) => hasFeature(d, "applicationDetails");

export const LIMITS = {
  position: [2, 100],
  affiliation: [2, 200],
  expertise: [2, 1000],
  relevantExperience: [2, 2000],
  question: [5, 2000],
  answer: [1, 4000],
  reason: [2, 500],
} as const;

const within = (v: string, [min, max]: readonly [number, number]) => v.trim().length >= min && v.trim().length <= max;

/** "" → undefined; a whole number 0–60 → the number; anything else → NaN (invalid). */
export function parseYears(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  if (!/^\d{1,2}$/.test(t)) return Number.NaN;
  const n = Number(t);
  return n <= 60 ? n : Number.NaN;
}

const yearsError = (v: string) => (Number.isNaN(parseYears(v)) ? "Enter a whole number of years from 0 to 60." : undefined);

// ─── Teacher ───────────────────────────────────────────────────────────────

export interface TeacherExtraDraft { position: string; yearsOfExperience: string }
export const emptyTeacherExtra = (): TeacherExtraDraft => ({ position: "", yearsOfExperience: "" });

export function validateTeacherExtra(d: TeacherExtraDraft): Partial<Record<keyof TeacherExtraDraft, string>> {
  const e: Partial<Record<keyof TeacherExtraDraft, string>> = {};
  if (!within(d.position, LIMITS.position)) e.position = "Enter your position or teaching role (2–100 characters).";
  const y = yearsError(d.yearsOfExperience);
  if (y) e.yearsOfExperience = y;
  return e;
}

export function teacherExtraPayload(d: TeacherExtraDraft): { position: string; yearsOfExperience?: number } {
  const years = parseYears(d.yearsOfExperience);
  return { position: d.position.trim(), ...(years !== undefined && { yearsOfExperience: years }) };
}

// ─── Coach ─────────────────────────────────────────────────────────────────

export interface CoachExtraDraft { phone: string; affiliation: string; expertise: string; relevantExperience: string; yearsOfExperience: string }
export const emptyCoachExtra = (): CoachExtraDraft => ({ phone: "", affiliation: "", expertise: "", relevantExperience: "", yearsOfExperience: "" });

export function validateCoachExtra(d: CoachExtraDraft): Partial<Record<keyof CoachExtraDraft, string>> {
  const e: Partial<Record<keyof CoachExtraDraft, string>> = {};
  if (d.phone.replace(/[^\d]/g, "").length < 9) e.phone = "Enter your phone number (Rwanda: 07XXXXXXXX; elsewhere: +country number).";
  if (d.affiliation.trim() && !within(d.affiliation, LIMITS.affiliation)) e.affiliation = "2–200 characters.";
  if (!within(d.expertise, LIMITS.expertise)) e.expertise = "Describe your areas of expertise (2–1000 characters).";
  if (!within(d.relevantExperience, LIMITS.relevantExperience)) e.relevantExperience = "Describe your relevant experience (2–2000 characters).";
  const y = yearsError(d.yearsOfExperience);
  if (y) e.yearsOfExperience = y;
  return e;
}

export function coachExtraPayload(d: CoachExtraDraft) {
  const years = parseYears(d.yearsOfExperience);
  return {
    phone: d.phone.trim(),
    ...(d.affiliation.trim() && { affiliation: d.affiliation.trim() }),
    expertise: d.expertise.trim(),
    relevantExperience: d.relevantExperience.trim(),
    ...(years !== undefined && { yearsOfExperience: years }),
  };
}

// ─── Requests for more information ─────────────────────────────────────────

export interface InfoRequest {
  id: string;
  question: string;
  requestedAt: string;
  expiresAt: string;
  answer: string | null;
  answeredAt: string | null;
  cancelledAt: string | null;
  requestedBy: { id: string; firstName: string; lastName: string } | null;
}

export type InfoRequestState = "OPEN" | "ANSWERED" | "CANCELLED" | "EXPIRED";

export function infoRequestState(r: Pick<InfoRequest, "answeredAt" | "cancelledAt" | "expiresAt">, now = Date.now()): InfoRequestState {
  if (r.answeredAt) return "ANSWERED";
  if (r.cancelledAt) return "CANCELLED";
  return new Date(r.expiresAt).getTime() <= now ? "EXPIRED" : "OPEN";
}

/** The question the applicant still has to answer (newest first from the backend), or null. */
export function openInfoRequest(list: readonly InfoRequest[] | null | undefined, now = Date.now()): InfoRequest | null {
  return list?.find((r) => infoRequestState(r, now) === "OPEN") ?? null;
}

/** The newest answered request (shown to the reviewer), or null. */
export function latestAnswer(list: readonly InfoRequest[] | null | undefined): InfoRequest | null {
  return list?.find((r) => r.answeredAt) ?? null;
}

export const INFO_STATE_LABEL: Readonly<Record<InfoRequestState, string>> = {
  OPEN: "Waiting for the applicant",
  ANSWERED: "Answered",
  CANCELLED: "Withdrawn",
  EXPIRED: "Link expired",
};

export const questionProblem = (q: string) => (within(q, LIMITS.question) ? null : "Write a question of 5–2000 characters.");

export type ApplicationKind = "TEACHER" | "COACH";

export interface PublicInfoRequest {
  kind: ApplicationKind;
  firstName: string;
  question: string;
  requestedAt: string;
  expiresAt: string;
  correctable: string[];
  details: Record<string, string | number | null>;
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  phone: "Phone number",
  position: "Position or teaching role",
  yearsOfExperience: "Years of experience",
  affiliation: "Institution or affiliation",
  expertise: "Areas of expertise",
  relevantExperience: "Relevant experience",
  occupation: "Occupation",
};
export const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k;
export const isLongField = (k: string) => k === "expertise" || k === "relevantExperience";

/** The answer body: the answer plus only the corrected fields that changed (years as a number). */
export function answerBody(answer: string, edits: Record<string, string>, current: Record<string, string | number | null>, correctable: readonly string[]) {
  const body: Record<string, string | number> = { answer: answer.trim() };
  for (const k of correctable) {
    const v = (edits[k] ?? "").trim();
    if (!v || v === String(current[k] ?? "")) continue;
    if (k === "yearsOfExperience") {
      const n = parseYears(v);
      if (n !== undefined && !Number.isNaN(n)) body[k] = n;
    } else body[k] = v;
  }
  return body;
}

export function answerProblems(answer: string, edits: Record<string, string>): string[] {
  const out: string[] = [];
  if (!within(answer, LIMITS.answer)) out.push("Write your answer (up to 4000 characters).");
  if (edits.yearsOfExperience && Number.isNaN(parseYears(edits.yearsOfExperience))) out.push("Years of experience: a whole number from 0 to 60.");
  return out;
}

/** 410 INFO_REQUEST_LINK_INVALID: used, expired, replaced or decided. */
export const linkInvalid = (e: { status?: number; code?: string } | null | undefined) => e?.status === 410 || e?.code === "INFO_REQUEST_LINK_INVALID";

export const applicationInfoApi = {
  requestTeacher: (id: string, question: string) =>
    api<unknown>(`/admin/teacher-applications/${encodeURIComponent(id)}/request-info`, { method: "POST", body: { question } }),
  requestCoach: (id: string, question: string) => api<unknown>(`/mentor-requests/${encodeURIComponent(id)}/request-info`, { method: "POST", body: { question } }),
  view: (token: string) => api<PublicInfoRequest>(`/applications/info-requests/${encodeURIComponent(token)}`, { auth: false }),
  answer: (token: string, body: Record<string, string | number>) =>
    api<{ answered: true; kind: ApplicationKind }>(`/applications/info-requests/${encodeURIComponent(token)}`, { method: "POST", body, auth: false }),
};
