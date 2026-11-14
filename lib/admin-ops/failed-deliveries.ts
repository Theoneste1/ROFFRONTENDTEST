/** Failed e-mail deliveries page: how backend answers are shown. */
import { isApiError } from "@/lib/api/errors";

/** Older backends have no GET /admin/email/deliveries (404): say so instead of an error. */
export function failedDeliveryUnavailable(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/** The notice after a retry (error = null on success); null for errors without a specific message. */
export function retryOutcome(error: unknown, to: string): { tone: "success" | "error" | "info"; text: string } | null {
  if (!error) return { tone: "success", text: `The e-mail to ${to} is queued to be sent again.` };
  if (isApiError(error) && error.code === "CONTENT_NOT_KEPT") {
    return {
      tone: "info",
      text: `This e-mail to ${to} contained a one-time link, which is never kept. Send a new invitation or password-reset link from the user's page instead.`,
    };
  }
  if (isApiError(error) && error.status === 409) return { tone: "info", text: `The e-mail to ${to} is no longer failed (already queued or sent).` };
  return null;
}
