/**
 * Administrators' form management (`/admin/forms`, capability formAvailability): who may see it, state labels,
 * Kigali-time inputs, the schedule rules (mirroring the backend's scheduleProblems) and the request bodies.
 * Pure; unit-tested in tests/form-availability-admin.test.mjs.
 *
 * Permissions: forms.view (the page and its menu item), forms.manageAvailability (open / close / schedule),
 * forms.editMessages (closed message, instructions, contact e-mail, support link). Administrators and Super
 * Administrators hold all three. The API enforces every permission; this only decides what is shown.
 *
 * Kigali is UTC+2 all year (no daylight saving), so a Kigali wall-clock time is written as "…+02:00".
 */
import type { AdminFormView, AvailabilityChange, FormHistoryRow, FormMode, MessagesChange } from "../api/admin-forms";
import type { Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";
import { kigaliTime, type FormState } from "../forms/closed-form";

export const FORMS_VIEW_PERMISSION: Permission = "forms.view";
export const FORMS_MANAGE_PERMISSION: Permission = "forms.manageAvailability";
export const FORMS_MESSAGES_PERMISSION: Permission = "forms.editMessages";

export const FORM_STATE_META: Readonly<Record<FormState, { label: string; badge: string }>> = {
  OPEN: { label: "Open", badge: "bg-emerald-50 text-emerald-700" },
  CLOSED: { label: "Closed", badge: "bg-slate-100 text-slate-700" },
  NOT_YET_OPEN: { label: "Opens later", badge: "bg-amber-50 text-amber-700" },
  ENDED: { label: "Ended", badge: "bg-red-50 text-red-700" },
};

export const FORM_MODE_OPTIONS: readonly { value: FormMode; label: string; hint: string }[] = [
  { value: "OPEN", label: "Open now", hint: "Accepts submissions now, until the closing time if one is set." },
  { value: "SCHEDULED", label: "Scheduled", hint: "Opens at the opening time and closes at the closing time (if set)." },
  { value: "CLOSED", label: "Closed", hint: "Refuses submissions and shows the closed message." },
];

export function formStateLabel(state: string): string {
  return Object.prototype.hasOwnProperty.call(FORM_STATE_META, state) ? FORM_STATE_META[state as FormState].label : state;
}

export type FormsPageMode = "loading" | "unsupported" | "error" | "forbidden" | "visible";

/**
 * "loading" while the backend detection or the permissions load; "unsupported" without formAvailability;
 * "error" when the permissions could not be loaded; "forbidden" without forms.view; otherwise "visible".
 */
export function formsPageMode(opts: {
  detection: BackendDetection | undefined;
  detectionLoading: boolean;
  permissionsStatus: "loading" | "ready" | "error";
  can: (p: Permission) => boolean;
}): FormsPageMode {
  if (opts.detectionLoading || opts.permissionsStatus === "loading") return "loading";
  if (!hasFeature(opts.detection, "formAvailability")) return "unsupported";
  if (opts.permissionsStatus === "error") return "error";
  return opts.can(FORMS_VIEW_PERMISSION) ? "visible" : "forbidden";
}

/** The menu item: only for a backend with formAvailability AND the known forms.view. */
export function formsNavVisible(detection: BackendDetection | undefined, permissions: ReadonlySet<string> | null): boolean {
  return hasFeature(detection, "formAvailability") && !!permissions && permissions.has(FORMS_VIEW_PERMISSION);
}

// ─── Kigali time ⇄ ISO ─────────────────────────────────────────────────────

const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** An instant as a `<input type="datetime-local">` value in Kigali time ("2026-12-01T08:00"); "" for none / invalid. */
export function isoToKigaliInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  return new Date(t + KIGALI_OFFSET_MS).toISOString().slice(0, 16);
}

/** A Kigali `datetime-local` value as an ISO instant with the Kigali offset; null for "" or an invalid value. */
export function kigaliInputToIso(value: string): string | null {
  const m = LOCAL_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Reject impossible dates (e.g. 31 February) rather than letting them roll over.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return `${value.trim()}:00+02:00`;
}

// ─── Availability ──────────────────────────────────────────────────────────

export interface AvailabilityDraft {
  mode: FormMode;
  /** datetime-local values in Kigali time; "" = none. */
  opensAt: string;
  closesAt: string;
}

export function availabilityDraft(f: Pick<AdminFormView, "mode" | "opensAt" | "closesAt">): AvailabilityDraft {
  return { mode: f.mode, opensAt: isoToKigaliInput(f.opensAt), closesAt: isoToKigaliInput(f.closesAt) };
}

/**
 * Problems with a draft, as the backend checks them (scheduleProblems) plus unreadable dates. OPEN ignores the
 * opening time and CLOSED ignores both; the stored dates are kept either way.
 */
export function availabilityProblems(d: AvailabilityDraft): string[] {
  const problems: string[] = [];
  const opens = d.opensAt ? kigaliInputToIso(d.opensAt) : null;
  const closes = d.closesAt ? kigaliInputToIso(d.closesAt) : null;
  if (d.opensAt && !opens) problems.push("The opening time is not a valid date and time.");
  if (d.closesAt && !closes) problems.push("The closing time is not a valid date and time.");
  if (d.mode === "SCHEDULED" && !d.opensAt) problems.push("A scheduled form needs an opening time.");
  if (d.mode === "SCHEDULED" && opens && closes && new Date(closes).getTime() <= new Date(opens).getTime()) {
    problems.push("The closing time must be after the opening time.");
  }
  return problems;
}

/** The PATCH body: only what changed (an emptied date is sent as null). null when nothing changed. */
export function availabilityChange(current: Pick<AdminFormView, "mode" | "opensAt" | "closesAt">, d: AvailabilityDraft): AvailabilityChange | null {
  const before = availabilityDraft(current);
  const body: AvailabilityChange = {};
  if (d.mode !== before.mode) body.mode = d.mode;
  if (d.opensAt !== before.opensAt) body.opensAt = d.opensAt ? kigaliInputToIso(d.opensAt) : null;
  if (d.closesAt !== before.closesAt) body.closesAt = d.closesAt ? kigaliInputToIso(d.closesAt) : null;
  return Object.keys(body).length ? body : null;
}

/** One line describing when the form accepts submissions, e.g. "Open until 31 December 2026, 17:00 (Kigali time)". */
export function scheduleSummary(f: Pick<AdminFormView, "state" | "mode" | "opensAt" | "closesAt">): string {
  const opens = kigaliTime(f.opensAt);
  const closes = kigaliTime(f.closesAt);
  switch (f.state) {
    case "OPEN":
      return closes ? `Open until ${closes}` : "Open, no closing date";
    case "NOT_YET_OPEN":
      return opens ? `Opens ${opens}${closes ? `, closes ${closes}` : ""}` : "Scheduled without an opening time (stays closed)";
    case "ENDED":
      return closes ? `Closed since ${closes}` : "Ended";
    default:
      return "Closed";
  }
}

// ─── Messages ──────────────────────────────────────────────────────────────

export interface MessagesDraft {
  closedMessage: string;
  instructions: string;
  contactEmail: string;
  supportUrl: string;
}

export const MESSAGE_LIMITS: Readonly<Record<keyof MessagesDraft, number>> = {
  closedMessage: 1000,
  instructions: 2000,
  contactEmail: 254,
  supportUrl: 500,
};

/** The editable texts. The closed message starts from the administrator's own text ("" = the built-in one). */
export function messagesDraft(f: Pick<AdminFormView, "closedMessageCustom" | "instructions" | "contactEmail" | "supportUrl">): MessagesDraft {
  return {
    closedMessage: f.closedMessageCustom ?? "",
    instructions: f.instructions ?? "",
    contactEmail: f.contactEmail ?? "",
    supportUrl: f.supportUrl ?? "",
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function messagesProblems(d: MessagesDraft): Partial<Record<keyof MessagesDraft, string>> {
  const out: Partial<Record<keyof MessagesDraft, string>> = {};
  for (const k of Object.keys(MESSAGE_LIMITS) as (keyof MessagesDraft)[]) {
    if (d[k].trim().length > MESSAGE_LIMITS[k]) out[k] = `At most ${MESSAGE_LIMITS[k]} characters.`;
  }
  const email = d.contactEmail.trim();
  if (email && !out.contactEmail && !EMAIL_RE.test(email)) out.contactEmail = "Enter an e-mail address.";
  const url = d.supportUrl.trim();
  if (url && !out.supportUrl) {
    let ok = false;
    try {
      ok = new URL(url).protocol === "https:";
    } catch {
      ok = false;
    }
    if (!ok) out.supportUrl = "Enter a link starting with https://.";
  }
  return out;
}

/** The PATCH body: only the fields that changed; an emptied field is sent as null (built-in message / removed). */
export function messagesChange(current: Parameters<typeof messagesDraft>[0], d: MessagesDraft): MessagesChange | null {
  const before = messagesDraft(current);
  const body: MessagesChange = {};
  for (const k of Object.keys(before) as (keyof MessagesDraft)[]) {
    const next = d[k].trim();
    if (next !== before[k].trim()) body[k] = next === "" ? null : next;
  }
  return Object.keys(body).length ? body : null;
}

// ─── E-mail activation per sign-up form (owner 2026-11-23) ────────────────────

/** null: the form has no activation switch (the contact form, or a backend without formEmailVerification). */
export function activationSummary(f: Pick<AdminFormView, "requireEmailVerification">): string | null {
  if (f.requireEmailVerification === undefined) return null;
  return f.requireEmailVerification
    ? "Required: people who sign up must open the link in their e-mail before they can sign in."
    : "Not required: people who sign up can sign in at once.";
}

/** What the switch button says. */
export const activationAction = (on: boolean) => (on ? "Stop requiring e-mail activation" : "Require e-mail activation");

/** The confirmation after a change. */
export function activationSaved(f: Pick<AdminFormView, "label" | "requireEmailVerification">): string {
  return f.requireEmailVerification
    ? `${f.label}: e-mail activation is now required for new sign-ups.`
    : `${f.label}: e-mail activation is no longer required. New sign-ups can sign in at once; anyone still waiting for an activation link can be activated by an administrator.`;
}

// ─── History ───────────────────────────────────────────────────────────────

const FIELD_LABELS: Readonly<Record<string, string>> = {
  mode: "Mode",
  opensAt: "Opening time",
  closesAt: "Closing time",
  closedMessage: "Closed message",
  instructions: "Instructions",
  contactEmail: "Contact e-mail",
  supportUrl: "Support link",
  requireEmailVerification: "E-mail activation",
};

const MODE_LABELS: Readonly<Record<string, string>> = { OPEN: "Open", CLOSED: "Closed", SCHEDULED: "Scheduled" };

function describeValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return field === "closedMessage" ? "built-in message" : "none";
  if (field === "mode" && typeof v === "string") return MODE_LABELS[v] ?? v;
  if (field === "requireEmailVerification") return v === true ? "required" : "not required";
  if ((field === "opensAt" || field === "closesAt") && typeof v === "string") return kigaliTime(v) ?? v;
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

/** Readable lines for one history row, e.g. ["Mode: Closed → Open"]. */
export function historyLines(row: Pick<FormHistoryRow, "metadata">): string[] {
  const changes = row.metadata?.changes ?? {};
  return Object.entries(changes).map(([field, c]) => `${FIELD_LABELS[field] ?? field}: ${describeValue(field, c?.from)} → ${describeValue(field, c?.to)}`);
}

/** Where the change came from: the forms page, or the old switch on the Settings page. */
export function historySource(row: Pick<FormHistoryRow, "action" | "metadata">): string {
  if (row.action === "FORM_MESSAGES_CHANGED") return "Messages";
  return row.metadata?.via === "setting" ? "Availability (Settings switch)" : "Availability";
}

// ─── Errors and notes ──────────────────────────────────────────────────────

/** A known refusal as a readable message; null = use the generic message. */
export function formsErrorMessage(e: { status?: number; code?: string; message?: string } | null | undefined): string | null {
  if (!e) return null;
  if (e.code === "INVALID_FORM_SCHEDULE") return `The schedule was refused: ${e.message ?? "check the opening and closing times."}`;
  if (e.code === "NO_CHANGES") return "Nothing changed.";
  if (e.code === "NOT_A_SIGN_UP_FORM") return "E-mail activation can be set only on the student, teacher and coach sign-up forms.";
  if (e.code === "FORM_NOT_FOUND" || e.status === 404) return "This server does not know this form.";
  if (e.status === 403) return "You don't have permission to change this form.";
  return null;
}

/** TEACHER_REGISTRATION on a server without the Teacher role: it stays closed whatever its mode. */
export function teacherRoleNote(f: Pick<AdminFormView, "key" | "requiresTeacherRole" | "teacherRoleEnabled">): string | null {
  if (f.key !== "TEACHER_REGISTRATION" || !f.requiresTeacherRole || f.teacherRoleEnabled) return null;
  return "The Teacher role is not enabled on this server, so teacher registration stays closed whatever is set here.";
}

/** Whether the form has ever been changed (the backend reports the epoch for a form still at its initial setting). */
export function neverChanged(f: Pick<AdminFormView, "updatedAt">): boolean {
  return new Date(f.updatedAt).getTime() <= 0;
}
