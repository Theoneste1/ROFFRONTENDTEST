/**
 * Phone numbers, exactly as the backend checks them (normalisePhone in
 * src/schools/directory/school-contacts.ts): teacher registration, student registration
 * (student and close-family phones) and any other form that asks for a phone.
 */

const PHONE_SEPARATORS = /[\s().\-/]/g;

/**
 * E.164, or null. Rwanda: 9 national digits starting with 2 (landline) or 7 (mobile), written 07…,
 * 7…, 2507…, +2507… or 002507…; elsewhere the international form +[1-9] and 8–15 digits.
 */
export function normalisePhone(raw: string): string | null {
  let s = raw.replace(PHONE_SEPARATORS, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (/^0[27]\d{8}$/.test(s)) return `+250${s.slice(1)}`;
  if (/^250[27]\d{8}$/.test(s)) return `+${s}`;
  if (/^[27]\d{8}$/.test(s)) return `+250${s}`;
  if (s.startsWith("+250")) return /^\+250[27]\d{8}$/.test(s) ? s : null;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

export const PHONE_HINT = "Rwanda: 07XXXXXXXX or +2507XXXXXXXX. Elsewhere: + country code and number.";
