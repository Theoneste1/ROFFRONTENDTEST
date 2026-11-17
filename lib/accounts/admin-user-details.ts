/**
 * Personal details on the administrators' user page (ACC-02): date of birth (with age), the account's phone, the
 * close-family (guardian) phone, home country and home place. The backend returns them only to users.manage holders and
 * only for ONE account (lists carry masked phones), so the page shows what it receives; nothing is fetched elsewhere.
 * Pure; tested in tests/admin-user-details.test.mjs.
 */
import { countryName } from "../schools/countries";

export interface PersonalDetailsSource {
  role: string;
  dateOfBirth?: string | null;
  phone?: string | null;
  guardianPhone?: string | null;
  country?: string | null;
  homeProvince?: string | null;
  homeDistrict?: string | null;
  homeSector?: string | null;
}

/** Whole years on `today` (UTC calendar date of an ISO "YYYY-MM-DD…" value); null when unreadable. */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** "1 May 2012 (14 years)" — the calendar date as stored, never shifted by the viewer's time zone. */
export function dateOfBirthText(dateOfBirth: string, today: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOfBirth);
  if (!m) return dateOfBirth;
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const text = `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
  const age = ageOn(dateOfBirth, today);
  return age === null ? text : `${text} (${age} year${age === 1 ? "" : "s"})`;
}

/**
 * The rows to show; a field the backend did not send (older backends) is left out, a field sent as null shows "—".
 * The guardian phone row is for students only.
 */
export function personalDetailRows(u: PersonalDetailsSource, today: Date = new Date()): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const has = (k: keyof PersonalDetailsSource) => Object.prototype.hasOwnProperty.call(u, k);
  if (has("dateOfBirth")) rows.push({ label: "Date of birth", value: u.dateOfBirth ? dateOfBirthText(u.dateOfBirth, today) : "—" });
  if (has("phone")) rows.push({ label: "Phone", value: u.phone || "—" });
  if (u.role === "STUDENT" && has("guardianPhone")) rows.push({ label: "Close-family phone", value: u.guardianPhone || "—" });
  if (has("country")) rows.push({ label: "Home country", value: u.country ? countryName(u.country) : "—" });
  if (has("homeSector") || has("homeDistrict") || has("homeProvince")) {
    const place = [u.homeSector, u.homeDistrict, u.homeProvince].filter(Boolean).join(", ");
    rows.push({ label: "Home place", value: place || "—" });
  }
  return rows;
}
