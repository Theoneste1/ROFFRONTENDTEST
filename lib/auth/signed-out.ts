/**
 * "Signed out on this device" marker (H1).
 *
 * The refresh token is an httpOnly cookie, so the page can never delete it
 * itself; only the server's logout answer clears it. If that answer is lost
 * (network failure, server asleep, tab closed mid-request), the cookie may
 * still hold a live session, and a reload would silently sign the previous
 * user back in — on a shared school computer, the next person.
 *
 * So an explicit sign-out first writes this marker to localStorage (shared by
 * every tab of the browser profile and kept across reloads). While it is set:
 *   - the page never restores a session from the cookie (no silent refresh);
 *   - on load it repeats the server logout (best effort) to revoke the session;
 *   - other tabs sign out when they see it appear (also without BroadcastChannel).
 * Only a successful sign-in clears it.
 *
 * Every storage call may throw (no window, storage blocked); then the marker is
 * simply absent and the server-side logout is the only protection.
 */

export const SIGNED_OUT_KEY = "rof-signed-out";

export interface MarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): MarkerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The server has not (yet) confirmed the logout: repeat it on the next load. */
const PENDING = "pending";
/** The server confirmed it (or had already ended the session): nothing to repeat. */
const CONFIRMED = "confirmed";

function write(storage: MarkerStorage | null, value: string) {
  try {
    storage?.setItem(SIGNED_OUT_KEY, value);
  } catch {
    /* storage blocked: the server-side logout is the only protection */
  }
}

function read(storage: MarkerStorage | null): string | null {
  try {
    return storage?.getItem(SIGNED_OUT_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Record that the user signed out on this device, before the server is asked. */
export function markSignedOut(storage: MarkerStorage | null = browserStorage()): void {
  write(storage, PENDING);
}

/** The server confirmed the logout, or had already ended every session (sign out everywhere, password change). */
export function confirmSignedOut(storage: MarkerStorage | null = browserStorage()): void {
  write(storage, CONFIRMED);
}

/** True while an explicit sign-out on this device has not been followed by a sign-in. */
export function isMarkedSignedOut(storage: MarkerStorage | null = browserStorage()): boolean {
  return read(storage) !== null;
}

/**
 * The server logout should be (re)sent on load: signed out, but not confirmed.
 * Once confirmed it is not repeated, which keeps the per-IP logout rate limit
 * free for the many pupils sharing one school address.
 */
export function needsServerLogout(storage: MarkerStorage | null = browserStorage()): boolean {
  const value = read(storage);
  return value !== null && value !== CONFIRMED;
}

/** A successful sign-in ends the signed-out state. */
export function clearSignedOut(storage: MarkerStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** For a `storage` event from another tab: did that tab just sign out? */
export function isSignedOutEvent(event: Pick<StorageEvent, "key" | "newValue">): boolean {
  return event.key === SIGNED_OUT_KEY && event.newValue !== null;
}
