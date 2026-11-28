/**
 * What one person leaves in this browser that the next person must not see (owner 2026-11-28: user-specific cached
 * information is cleared at sign-out). The query cache is cleared by the session itself; this removes the browser
 * storage the app writes for a signed-in person:
 *   - unfinished test-upload keys (sessionStorage "rof.testUpload.<test>.<student>": they name a student);
 *   - the academic-year activation in progress (localStorage "rof.academicYearActivation");
 *   - the shared last-activity time of the inactivity timer (lib/auth/idle.ts).
 * Per-person preferences keyed by the person's own id (e.g. "rof.marking.queueView.<userId>", a coach's saved Show
 * choice) are kept on purpose: they reveal nothing to another person and the owner asked for them to be remembered.
 */
import { LAST_ACTIVITY_KEY } from "./idle";

const SESSION_PREFIXES = ["rof.testUpload."];
const LOCAL_KEYS = ["rof.academicYearActivation", LAST_ACTIVITY_KEY];

export function clearUserBrowserData(): void {
  if (typeof window === "undefined") return;
  try {
    const ss = window.sessionStorage;
    for (const key of Object.keys(ss)) if (SESSION_PREFIXES.some((p) => key.startsWith(p))) ss.removeItem(key);
  } catch {
    // storage unavailable: nothing was stored there
  }
  try {
    for (const key of LOCAL_KEYS) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
