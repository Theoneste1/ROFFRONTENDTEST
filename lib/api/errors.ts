import type { ApiErrorBody } from "./types";
import { plainValidationMessage } from "./plain-validation";

/**
 * An error answered by the API (or a network failure, `status: 0`).
 * Branch on `code`, never on `message` (which may change).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  static fromBody(status: number, body: Partial<ApiErrorBody> | null, fallback: string): ApiError {
    return new ApiError(
      status,
      body?.code ?? (status === 0 ? "NETWORK_ERROR" : "ERROR"),
      body?.message ?? fallback,
      body?.details,
      body?.requestId,
    );
  }

  /** Validation messages (`400 VALIDATION_FAILED` → `details: string[]`). */
  get validationMessages(): string[] {
    return Array.isArray(this.details) ? this.details.filter((d): d is string => typeof d === "string") : [];
  }
}

/**
 * A message written for the person using the page (not a technical error): dialogs and forms show it exactly as written.
 * Throw it when a page turns a server's refusal into its own words — a plain Error would be shown as "Something went wrong".
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/**
 * Validation messages from the backend start with the property name
 * ("password must be longer than…"). Group them by field for display.
 */
export function fieldErrors(error: unknown, fields: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isApiError(error)) return out;
  for (const msg of error.validationMessages) {
    const field = fields.find((f) => msg === f || msg.startsWith(f + " "));
    // Shown next to the field in plain words ("Opens at must be a valid date and time."), never the raw rule.
    if (field && !out[field]) out[field] = plainValidationMessage(msg);
  }
  return out;
}

/** Codes the server uses for a status without a reason of its own (all-exceptions.filter.ts STATUS_CODES). */
const GENERIC_CODES = new Set(["BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "SERVICE_UNAVAILABLE", "INTERNAL_ERROR", "ERROR"]);

/**
 * 429: how long to wait. The server's own wait (details.retryAfter, seconds: a sign-in lock can last up to an hour)
 * comes first; a specific limit of ours keeps its message (the contact form's daily limit …); the generic per-minute
 * limits (every route's throttle resets within 60 seconds) say "a minute".
 */
function tooManyMessage(error: ApiError): string {
  const after = (error.details as { retryAfter?: unknown } | undefined)?.retryAfter;
  if (typeof after === "number" && Number.isFinite(after) && after > 0) {
    return `Too many attempts in a short time. Wait ${waitText(after)}, then try again.`;
  }
  if (error.code !== "TOO_MANY_REQUESTS" && error.code !== "ERROR" && error.message) return error.message;
  return "Too many attempts in a short time. Wait a minute, then try again.";
}

/** 45 → "a minute"; 300 → "5 minutes"; 3600 → "about an hour". */
export function waitText(seconds: number): string {
  if (seconds <= 60) return "a minute";
  if (seconds >= 3300) return "about an hour";
  return `${Math.ceil(seconds / 60)} minutes`;
}

/** The fallback when nothing better is known. */
export const UNEXPECTED_ERROR = "Something unexpected went wrong. Please try again. If it keeps happening, contact the Rwanda Olympiad Foundation team.";

/**
 * A user-facing message for any thrown value (owner 2026-11-22: every error says clearly what happened and what to do).
 * Our own API errors carry a message written for people; this adds plain words where the answer is technical or empty
 * (a proxy's HTML page, a server restart, a validation rule) and the reference to quote for server failures.
 */
export function errorMessage(error: unknown, fallback = UNEXPECTED_ERROR): string {
  if (error instanceof UserFacingError && error.message) return error.message;
  if (!isApiError(error)) return fallback;
  const ref = error.requestId ? ` (reference ${error.requestId})` : "";
  switch (error.code) {
    case "NETWORK_ERROR":
      return "Cannot reach the server. Check your internet connection, then try again.";
    case "SESSION_REFRESH_UNAVAILABLE":
      return "Can't reach the server to renew your session. You are still signed in — please try again in a moment.";
    case "VALIDATION_FAILED": {
      const first = error.validationMessages[0];
      if (!first) return error.message || "Some of the information is missing or not valid. Check the form and try again.";
      const more = error.validationMessages.length - 1;
      return `${plainValidationMessage(first)}${more > 0 ? ` (and ${more} more problem${more === 1 ? "" : "s"} — check the form)` : ""}`;
    }
    // Every pooled database connection stayed busy (503, Retry-After: 2): refused before anything changed.
    case "DATABASE_BUSY":
      return "The server is busy right now. Nothing was changed — please try again in a moment.";
    case "INTERNAL_ERROR":
      return `Something went wrong on our side and this could not be completed. Please try again in a moment. If it keeps happening, contact the Rwanda Olympiad Foundation team${ref ? ` and give them the reference ${error.requestId}` : ""}.`;
  }
  if (error.status === 429) return tooManyMessage(error);
  // An answer that is not ours (a proxy or a hosting page, no JSON body): code "ERROR" with the HTTP status text.
  if (error.code === "ERROR") {
    if (error.status === 401) return "Your session has ended. Please sign in again.";
    if (error.status === 403) return "You don't have permission to do this. If you think you should, contact an administrator.";
    if (error.status === 404) return "This page or item wasn't found. It may have been removed, or the link is wrong. Go back and try again.";
    if (error.status === 408) return "The server took too long to answer. Check your connection and try again.";
    if (error.status === 413) return "What you sent is too large. Choose a smaller file (or a lower-resolution photo) and try again.";
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return "The server isn't responding right now (it may be restarting). Wait a minute, then try again. If you were saving something, check whether it was saved before trying again.";
    }
    if (error.status >= 500) return `The server had a problem${ref}. Please try again in a moment. If it keeps happening, contact the Rwanda Olympiad Foundation team.`;
    return fallback;
  }
  // A server failure without a specific code of ours ("Service Unavailable"): plain words and the reference. Specific
  // codes (an e-mail service not configured, a data source missing …) carry their own message, written for people.
  if (error.status >= 500 && (!error.message || GENERIC_CODES.has(error.code))) {
    return `The server had a problem${ref}. Please try again in a moment. If it keeps happening, contact the Rwanda Olympiad Foundation team.`;
  }
  return error.message || fallback;
}
