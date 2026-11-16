/**
 * Sign-in refusals that come after a correct password (403): the account exists but may not be used. Pure; tested in
 * tests/login-refusals.test.mjs. Each is shown with a "Get help" link to /support.
 *
 * ACCOUNT_DEACTIVATED and ACCOUNT_ARCHIVED come from backends with account states; ACCOUNT_SUSPENDED and
 * ACCOUNT_PENDING_APPROVAL from every backend.
 */
const REFUSALS: Readonly<Record<string, string>> = {
  ACCOUNT_SUSPENDED: "Your account is suspended. Contact ROF support if you think this is a mistake.",
  ACCOUNT_DEACTIVATED: "Your account has been deactivated, so you can't sign in at the moment. Contact ROF support if you need access again.",
  ACCOUNT_ARCHIVED: "This account has been archived and can no longer be used to sign in. Contact ROF support if you think this is a mistake.",
  ACCOUNT_PENDING_APPROVAL: "Your account is waiting for an administrator's approval. You'll receive an e-mail once it is approved.",
};

/** The message for an account-state refusal code, or null when the code is not one of them. */
export function accountRefusalMessage(code: string | null | undefined): string | null {
  return code && Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : null;
}
