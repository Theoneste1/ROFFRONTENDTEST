/**
 * A one-time message for the sign-in page (for example "your password was
 * changed"). Kept in sessionStorage, not in the URL, so it survives the
 * RoleGate redirect to `/login?next=…` and is shown once.
 */
const KEY = "rof-login-notice";

export type LoginNotice = "password-changed" | "signed-out-everywhere";

export const LOGIN_NOTICE_TEXT: Record<LoginNotice, string> = {
  "password-changed": "Your password was changed and all your sessions were signed out. Sign in with your new password.",
  "signed-out-everywhere": "You were signed out on every device. Sign in again to continue.",
};

export function setLoginNotice(notice: LoginNotice): void {
  try {
    sessionStorage.setItem(KEY, notice);
  } catch {
    // Storage unavailable: the sign-in page simply shows no message.
  }
}

/** Reads the notice (safe during render; null on the server). */
export function peekLoginNotice(): LoginNotice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "password-changed" || v === "signed-out-everywhere" ? v : null;
  } catch {
    return null;
  }
}

/** Clears the notice once it has been shown. */
export function clearLoginNotice(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
