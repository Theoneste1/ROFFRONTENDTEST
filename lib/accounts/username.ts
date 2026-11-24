/**
 * Usernames (owner feedback 2026-11-24: "many people are being confused" by "3–30 characters: lowercase letters, digits,
 * “.”, “_” or “-”."). One rule for every form that creates an account (student and teacher sign-up, coach application,
 * an Administrator adding a user, a coach invitation), and messages that say what is wrong with what was typed and
 * offer a username that would work. The rule itself is unchanged (backend: 3–30 of a–z, 0–9, ".", "_", "-").
 */

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Shown under the field before anything is typed. */
export const USERNAME_HINT =
  "The name you will sign in with — not your e-mail address. Use small letters, numbers, “.”, “_” or “-” (3 to 30 characters), for example tuyizere2010.";

/**
 * A username that follows the rule, made from what was typed: the part before "@" of an e-mail address, without quotes
 * and spaces, in small letters, accents removed, other characters dropped, cut to 30. null when nothing usable is left.
 */
export function suggestUsername(typed: string): string | null {
  let s = typed.trim().replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
  if (s.includes("@")) s = s.slice(0, s.indexOf("@"));
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  s = s.replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
  s = s.replace(/[._-]{2,}/g, (m) => m[0]).replace(/^[._-]+|[._-]+$/g, "");
  if (s.length > USERNAME_MAX) s = s.slice(0, USERNAME_MAX).replace(/[._-]+$/g, "");
  return s.length >= USERNAME_MIN ? s : null;
}

const example = (typed: string) => {
  const s = suggestUsername(typed);
  return s ? ` For example: ${s}` : "";
};

/** What is wrong with a username, in plain words with what to do; null when it is fine. */
export function usernameProblem(raw: string): string | null {
  const typed = raw ?? "";
  const v = typed.trim();
  if (!v) return "Choose a username: the name you will sign in with, for example tuyizere2010.";
  if (USERNAME_PATTERN.test(v)) return null;
  if (v.includes("@")) {
    return `A username is not an e-mail address. Use only the part before “@”, without the rest.${example(v)}`;
  }
  if (/["'“”‘’`]/.test(v)) return `Remove the quotation marks.${example(v)}`;
  if (/\s/.test(v)) return `A username cannot contain spaces. Join the words with a dot or leave the spaces out.${example(v)}`;
  if (/[A-Z]/.test(v) && USERNAME_PATTERN.test(v.toLowerCase())) return `Use small letters only.${example(v)}`;
  if (v.length < USERNAME_MIN) return `A username needs at least ${USERNAME_MIN} characters.`;
  if (v.length > USERNAME_MAX) return `A username can have at most ${USERNAME_MAX} characters (this one has ${v.length}).${example(v)}`;
  const bad = [...new Set([...v].filter((c) => !/[a-z0-9._-]/.test(c.toLowerCase())))].join(" ");
  return `These characters cannot be used: ${bad}. Use only small letters, numbers, “.”, “_” or “-”.${example(v)}`;
}
