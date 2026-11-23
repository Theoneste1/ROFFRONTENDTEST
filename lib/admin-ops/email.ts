/**
 * Bulk e-mail composer rules (pure; unit-tested in tests/admin-ops.test.mjs).
 *
 * Mirrors the backend SendEmailDto (src/email/dto/send-email.dto.ts): subject
 * 2–200 and body 5–10 000 characters after trimming, an idempotency key of
 * 8–128 characters, and one recipient mode. The ROLE mode accepts only
 * STUDENT, MENTOR and ADMIN — the API refuses every other role, so the
 * composer offers exactly these three. EXPLICIT takes 1–500 user IDs.
 */
import { isApiError } from "../api/errors";

export const EMAIL_RULES = {
  subject: { min: 2, max: 200 },
  body: { min: 5, max: 10_000 },
  idempotencyKey: { min: 8, max: 128 },
  explicitMax: 500,
} as const;

export const RECIPIENT_MODES = ["ROLE", "DIVISION", "SCHOOL", "EXPLICIT", "ALL"] as const;
export type RecipientMode = (typeof RECIPIENT_MODES)[number];

/** The roles POST /admin/email/send accepts (recipientRole) and GET /admin/email/users filters by. */
export const EMAIL_ROLES = ["STUDENT", "MENTOR", "ADMIN"] as const;
export type EmailRole = (typeof EMAIL_ROLES)[number];

export const EMAIL_ROLE_LABEL: Record<EmailRole, string> = { STUDENT: "Students", MENTOR: "Coaches", ADMIN: "Administrators" };

export const RECIPIENT_MODE_LABEL: Record<RecipientMode, string> = {
  ROLE: "Everyone with a role",
  DIVISION: "Students of a division",
  SCHOOL: "Students of a school",
  EXPLICIT: "Chosen people",
  ALL: "Every user",
};

export interface ComposerState {
  subject: string;
  body: string;
  mode: RecipientMode;
  role: EmailRole | "";
  divisionId: string;
  schoolId: string;
  userIds: readonly string[];
  /** ALL only: the sender confirmed that every active, approved user receives it. */
  confirmAll: boolean;
}

export interface SendEmailPayload {
  idempotencyKey: string;
  recipientMode: RecipientMode;
  subject: string;
  body: string;
  recipientRole?: EmailRole;
  recipientDivisionId?: string;
  recipientSchoolId?: string;
  recipientUserIds?: string[];
}

export type ComposerErrors = Partial<Record<"subject" | "body" | "recipients", string>>;

/** Field errors for the composer; an empty object means it can be sent. */
export function validateComposer(s: ComposerState): ComposerErrors {
  const errors: ComposerErrors = {};
  const subject = s.subject.trim();
  const body = s.body.trim();
  if (subject.length < EMAIL_RULES.subject.min || subject.length > EMAIL_RULES.subject.max) {
    errors.subject = `The subject must be ${EMAIL_RULES.subject.min}–${EMAIL_RULES.subject.max} characters.`;
  }
  if (body.length < EMAIL_RULES.body.min || body.length > EMAIL_RULES.body.max) {
    errors.body = `The message must be ${EMAIL_RULES.body.min}–${EMAIL_RULES.body.max.toLocaleString("en-GB")} characters.`;
  }
  switch (s.mode) {
    case "ROLE":
      if (!(EMAIL_ROLES as readonly string[]).includes(s.role)) errors.recipients = "Choose who receives it: students, coaches or administrators.";
      break;
    case "DIVISION":
      if (!s.divisionId) errors.recipients = "Choose a division.";
      break;
    case "SCHOOL":
      if (!s.schoolId) errors.recipients = "Choose a school.";
      break;
    case "EXPLICIT":
      if (s.userIds.length === 0) errors.recipients = "Choose at least one person.";
      else if (s.userIds.length > EMAIL_RULES.explicitMax) errors.recipients = `At most ${EMAIL_RULES.explicitMax} people per e-mail.`;
      break;
    case "ALL":
      if (!s.confirmAll) errors.recipients = "Confirm that every active user will receive this e-mail.";
      break;
    default:
      errors.recipients = "Choose who receives it.";
  }
  return errors;
}

/** The request body for POST /admin/email/send: only the field the chosen mode needs. */
export function buildSendPayload(s: ComposerState, idempotencyKey: string): SendEmailPayload {
  const base = { idempotencyKey, recipientMode: s.mode, subject: s.subject.trim(), body: s.body.trim() };
  switch (s.mode) {
    case "ROLE":
      return { ...base, recipientRole: s.role as EmailRole };
    case "DIVISION":
      return { ...base, recipientDivisionId: s.divisionId };
    case "SCHOOL":
      return { ...base, recipientSchoolId: s.schoolId };
    case "EXPLICIT":
      return { ...base, recipientUserIds: [...new Set(s.userIds)] };
    default:
      return base;
  }
}

/**
 * A fresh idempotency key for one composed e-mail. The composer keeps the same
 * key for every attempt to send that e-mail, so a double click or a retry after
 * a lost response returns the job already created instead of sending twice.
 */
export function newIdempotencyKey(random: () => string = randomId): string {
  return `email-${random()}`;
}

function randomId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const SEND_ERRORS: Record<string, string> = {
  NO_RECIPIENTS: "Nobody matches these recipients: only active, approved accounts receive e-mail.",
  RECIPIENTS_NOT_FOUND: "Some chosen people can no longer receive e-mail (suspended or not approved). Remove them and try again.",
  NOTHING_TO_RETRY: "This job has no failed deliveries to retry.",
  INVALID_STATE_TRANSITION: "This job is still being sent. Retry once it has finished.",
};

/** A user-facing message for a refused send or retry; null to fall back to the generic message. */
export function emailErrorMessage(error: unknown): string | null {
  if (!isApiError(error)) return null;
  if (SEND_ERRORS[error.code]) return SEND_ERRORS[error.code];
  if (error.status === 404) return "That division, school or job no longer exists.";
  if (error.status === 403) return "You don't have permission to send e-mail (email.bulkSend).";
  return null;
}

export type EmailJobStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "PARTIAL_FAILURE" | "FAILED";
/** DISCARDED (capability emailBudget): never sent on purpose — its one-time link was no longer valid; errorMessage says why. */
export type EmailDeliveryStatus = "PENDING" | "SENT" | "FAILED" | "DISCARDED";

/** Whether the job is still being worked on (the page polls until it is not). */
export function isJobRunning(status: EmailJobStatus): boolean {
  return status === "PENDING" || status === "IN_PROGRESS";
}

/** Retry is offered for a finished job with failed deliveries (the backend refuses otherwise). */
export function canRetryJob(job: { status: EmailJobStatus; failedCount: number }): boolean {
  return !isJobRunning(job.status) && job.failedCount > 0;
}
