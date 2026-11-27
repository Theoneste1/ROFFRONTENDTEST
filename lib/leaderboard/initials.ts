/**
 * Leaderboard initials (owner 2026-11-27: students see usernames, never names; staff see full names). Two parts for the
 * initials: a full name's first and last words, else a username's parts (split at . _ -), else its first two letters.
 */
export function initialsSource(displayName: string): [string, string] {
  const words = displayName.trim().split(/\s+/);
  if (words.length > 1) return [words[0], words[words.length - 1].replace(".", "")];
  const parts = displayName.split(/[._-]+/).filter(Boolean);
  if (parts.length > 1) return [parts[0], parts[1]];
  return [displayName.charAt(0), displayName.charAt(1)];
}
