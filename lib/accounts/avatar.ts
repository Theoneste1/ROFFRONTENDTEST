/**
 * The generated avatar and the profile picture rules (pure; unit-tested in tests/avatar.test.mjs).
 *
 * Without an uploaded picture every account shows a generated text avatar: the first name and the
 * first letter of the last name ("Theoneste N"), and a round two-letter badge ("TN") where space is
 * tight. Names are tidied (spaces collapsed, ALL-CAPS or all-lower-case words capitalised); a missing
 * name falls back to the username, then to "User". The colour is derived from the account, so it is
 * the same everywhere and on every visit.
 */

export interface AvatarPerson {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  id?: string | null;
}

/** Collapse whitespace; capitalise a word written entirely in upper or lower case ("THEONESTE", "theoneste"). */
function tidy(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w === w.toUpperCase() || w === w.toLowerCase() ? w.charAt(0).toLocaleUpperCase("en") + w.slice(1).toLocaleLowerCase("en") : w))
    .join(" ");
}

/** First letter of a word, upper case ("" for none). Handles accented and non-Latin letters. */
function initial(word: string): string {
  const ch = Array.from(word)[0] ?? "";
  return ch.toLocaleUpperCase("en");
}

/** "Theoneste N" — first name and last-name initial; the username or "User" when there is no name. */
export function avatarLabel(p: AvatarPerson | null | undefined): string {
  const first = tidy(p?.firstName);
  const last = tidy(p?.lastName);
  if (first && last) return `${first} ${initial(last)}`;
  if (first) return first;
  if (last) return last;
  const username = (p?.username ?? "").trim();
  return username || "User";
}

/** "TN" — up to two letters for the round badge. */
export function avatarInitials(p: AvatarPerson | null | undefined): string {
  const first = tidy(p?.firstName);
  const last = tidy(p?.lastName);
  if (first || last) {
    const letters = `${initial(first)}${initial(last)}`;
    return letters || "U";
  }
  const username = (p?.username ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  return username ? Array.from(username).slice(0, 2).join("").toLocaleUpperCase("en") : "U";
}

/** The full display name ("Theoneste Nsanzabarinda"), tidied; the username or "User" without one. */
export function displayName(p: AvatarPerson | null | undefined): string {
  const full = [tidy(p?.firstName), tidy(p?.lastName)].filter(Boolean).join(" ");
  return full || (p?.username ?? "").trim() || "User";
}

/** ROF navy and amber tones for the generated avatar (text colour readable on each, WCAG AA). */
export const AVATAR_TONES = [
  "bg-[#001E4E] text-amber-300",
  "bg-[#00428c] text-white",
  "bg-amber-400 text-[#001E4E]",
  "bg-[#2B2BB2] text-white",
  "bg-amber-200 text-[#001E4E]",
] as const;

/** A stable tone for the account (by id, else username, else name). */
export function avatarTone(p: AvatarPerson | null | undefined): string {
  const seed = p?.id || p?.username || avatarLabel(p);
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

// ─── Profile pictures (backend capability `profilePictures`) ────────────────

/** What the backend accepts for `PUT /me/avatar` (it checks the detected type again). */
export const AVATAR_RULES = {
  types: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
  extensions: [".jpg", ".jpeg", ".png", ".webp"] as readonly string[],
  maxBytes: 2 * 1024 * 1024,
  accept: "image/jpeg,image/png,image/webp",
};

/** A reason to refuse the file before uploading it, or null. */
export function avatarFileProblem(file: { name: string; type: string; size: number } | null | undefined): string | null {
  if (!file) return "Choose a picture.";
  const name = file.name.toLowerCase();
  const typeOk = AVATAR_RULES.types.includes(file.type) || (!file.type && AVATAR_RULES.extensions.some((e) => name.endsWith(e)));
  if (!typeOk) return "Use a JPEG, PNG or WebP picture.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > AVATAR_RULES.maxBytes) return "The picture must be 2 MB or smaller.";
  return null;
}

/**
 * Where to load a picture from: an API path (`/api/v1/users/:id/avatar?v=…`, fetched with the
 * session because it needs authentication) or an absolute https URL used as is; null otherwise.
 */
export function avatarSource(avatarUrl: string | null | undefined): { kind: "api"; path: string } | { kind: "url"; url: string } | null {
  const v = (avatarUrl ?? "").trim();
  if (!v) return null;
  if (v.startsWith("/api/v1/")) return { kind: "api", path: v.slice("/api/v1".length) };
  if (/^https:\/\//i.test(v)) return { kind: "url", url: v };
  return null;
}
