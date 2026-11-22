import type { ApiErrorBody } from "./types";

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
    if (field && !out[field]) out[field] = msg;
  }
  return out;
}

/** A user-facing message for any thrown value. */
export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof UserFacingError && error.message) return error.message;
  if (isApiError(error)) {
    switch (error.code) {
      case "NETWORK_ERROR":
        return "Cannot reach the server. Check your connection and try again.";
      case "SESSION_REFRESH_UNAVAILABLE":
        return "Can't reach the server to renew your session. You are still signed in — please try again in a moment.";
      case "VALIDATION_FAILED":
        return error.validationMessages[0] ?? error.message;
      // Phase 1 backend: every pooled database connection stayed busy (503, Retry-After: 2).
      // The request was refused before anything changed, so saying so lets people retry safely.
      case "DATABASE_BUSY":
        return "The server is busy right now. Nothing was changed — please try again in a moment.";
      default:
        if (error.status === 429) return "Too many requests. Please wait a moment and try again.";
        if (error.status >= 500) return "The server had a problem. Please try again shortly.";
        return error.message || fallback;
    }
  }
  return fallback;
}
