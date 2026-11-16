/**
 * Form availability (capability formAvailability): the public view of a form and the notice shown while it is closed.
 * Pure; tested in tests/closed-form.test.mjs.
 *
 * Two sources carry the administrator's texts:
 * - GET /api/v1/forms/:key: { open, state, opensAt, closesAt, closedMessage, instructions, contactEmail, supportUrl, … };
 * - a refused submission: 403 REGISTRATION_CLOSED (student / teacher registration) or FORM_CLOSED, whose `message` is the
 *   closed message (plus the opening time when not yet open) and whose `details` are
 *   { form, state, opensAt, closesAt, closedMessage, contactEmail, supportUrl } (no instructions).
 * Times are stored in UTC and shown in Kigali time, as the administrators set them.
 */

export type FormKey = "STUDENT_REGISTRATION" | "TEACHER_REGISTRATION" | "COACH_APPLICATION" | "CONTACT";
export type FormState = "OPEN" | "CLOSED" | "NOT_YET_OPEN" | "ENDED";

export interface PublicFormView {
  key: FormKey;
  label?: string;
  open: boolean;
  state: FormState;
  opensAt: string | null;
  closesAt: string | null;
  closedMessage: string;
  instructions: string | null;
  contactEmail: string | null;
  supportUrl: string | null;
  timezone?: string;
  serverTime?: string;
}

export interface ClosedFormNotice {
  message: string;
  instructions: string | null;
  contactEmail: string | null;
  /** Only an https link is shown (the backend accepts https only; anything else is dropped). */
  supportUrl: string | null;
  /** "1 December 2026, 08:00 (Kigali time)" when the form opens later; otherwise null. */
  opensAtText: string | null;
}

const KIGALI = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** "1 December 2026, 08:00 (Kigali time)"; null for a missing or invalid instant. */
export function kigaliTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(KIGALI.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} (Kigali time)`;
}

const httpsOnly = (u: string | null | undefined) => {
  if (!u) return null;
  try { return new URL(u).protocol === "https:" ? u : null; } catch { return null; }
};
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * May a registration form be shown? (formAvailability.) Never assume open: on a backend that advertises the
 * capability the form waits for GET /forms/:key, and a failed lookup is shown as a retryable error.
 * - notApplicable: the backend does not advertise formAvailability — behaviour as before.
 * - loading / failed / closed / open: the lookup is in flight / failed / says closed / says open.
 * Valid data already loaded wins over the query status: a failed background re-fetch sets react-query's status to
 * `error` but keeps the last answer, which still decides (open → the form stays, closed → the notice stays).
 * `failed` only when the lookup failed and there is no usable answer.
 */
export type FormGate = "notApplicable" | "loading" | "failed" | "closed" | "open";

export function formGate(enabled: boolean, q: { status: "pending" | "error" | "success"; data?: PublicFormView | null }): FormGate {
  if (!enabled) return "notApplicable";
  if (q.data && typeof q.data.open === "boolean") return q.data.open ? "open" : "closed";
  if (q.status === "pending") return "loading";
  return "failed";
}

/** The notice for a form that is not open (public view). Null when the form is open. */
export function noticeFromView(v: PublicFormView | null | undefined): ClosedFormNotice | null {
  if (!v || v.open) return null;
  return {
    message: text(v.closedMessage) ?? "This form is closed at the moment.",
    instructions: text(v.instructions),
    contactEmail: text(v.contactEmail),
    supportUrl: httpsOnly(v.supportUrl),
    opensAtText: v.state === "NOT_YET_OPEN" ? kigaliTime(v.opensAt) : null,
  };
}

/**
 * The notice for a refused submission (403 REGISTRATION_CLOSED / FORM_CLOSED from a backend with formAvailability),
 * or null when the error is not one, or carries no form details (an older backend: the caller keeps its fixed text).
 * `instructions` come from the public view when the caller has it.
 */
export function noticeFromRefusal(
  err: { status?: number; code?: string; message?: string; details?: unknown } | null | undefined,
  view?: PublicFormView | null,
): ClosedFormNotice | null {
  if (!err || err.status !== 403 || (err.code !== "REGISTRATION_CLOSED" && err.code !== "FORM_CLOSED")) return null;
  const d = (err.details && typeof err.details === "object" ? err.details : null) as Record<string, unknown> | null;
  if (!d || typeof d.form !== "string") return null;
  return {
    // The backend's message already includes "It opens on … (Kigali time)." when it opens later.
    message: text(err.message) ?? text(d.closedMessage) ?? "This form is closed at the moment.",
    instructions: text(view?.instructions),
    contactEmail: text(d.contactEmail),
    supportUrl: httpsOnly(typeof d.supportUrl === "string" ? d.supportUrl : null),
    opensAtText: null,
  };
}
