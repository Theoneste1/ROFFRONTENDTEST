import { isApiError } from "../api/errors";

/**
 * 409 IDENTITY_TAKEN answered to an Administrator (backends from 2026-11-24): `details.fields` says which of the username
 * and the e-mail address another account already uses, so the form marks that field. Public sign-up never says which
 * (no probing for accounts): there the list is empty and the form keeps its combined message.
 */
export function takenFields(error: unknown): Array<"username" | "email"> {
  if (!isApiError(error) || error.code !== "IDENTITY_TAKEN") return [];
  const fields = (error.details as { fields?: unknown } | undefined)?.fields;
  return Array.isArray(fields) ? fields.filter((f): f is "username" | "email" => f === "username" || f === "email") : [];
}

export const TAKEN_FIELD_TEXT = {
  username: "This username is already used by another account. Choose a different username.",
  email: "This e-mail address is already used by another account. Use a different one, or find the existing account in Users.",
} as const;
