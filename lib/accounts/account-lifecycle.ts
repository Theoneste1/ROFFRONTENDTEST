/**
 * Account status and the lifecycle actions an administrator is offered on one account (pure; tested in
 * tests/account-lifecycle.test.mjs).
 *
 * - A backend with `accountStates` sends `accountStatus` (ACTIVE, DEACTIVATED, SUSPENDED, ARCHIVED) and never deletes
 *   an account: the page offers **Archive** instead of Delete, and **Restore** for an archived account (the backend
 *   refuses to reactivate an archived account through the old suspend switch). Both need a reason.
 * - Any other backend (production before the account-states release): suspend, reactivate and delete, exactly as before.
 * - Not known yet (capabilities loading, or the backend not answering): suspend / reactivate only — never Delete, so a
 *   backend that archives instead is never offered a permanent deletion while the page is still finding out.
 */

export type DisplayStatus = "ACTIVE" | "AWAITING_SETUP" | "AWAITING_APPROVAL" | "SUSPENDED" | "DEACTIVATED" | "ARCHIVED";

export interface LifecycleUser {
  isActive: boolean;
  isApproved: boolean;
  activatedAt: string | null;
  accountStatus?: "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "ARCHIVED";
}

/** The status shown for an account, in order of precedence; the backend's account state wins when it is sent. */
export function displayStatus(u: LifecycleUser): DisplayStatus {
  if (u.accountStatus === "ARCHIVED") return "ARCHIVED";
  if (u.accountStatus === "DEACTIVATED") return "DEACTIVATED";
  if (!u.isActive) return "SUSPENDED";
  if (!u.activatedAt) return "AWAITING_SETUP";
  if (!u.isApproved) return "AWAITING_APPROVAL";
  return "ACTIVE";
}

export type LifecycleAction = "suspend" | "reactivate" | "archive" | "restore" | "delete";

/**
 * The lifecycle buttons for an account. Never any for the administrator's own account (the backend refuses it).
 * `canArchive`: the administrator holds `users.archive` (archive and restore an archived account).
 */
export function lifecycleActions(u: LifecycleUser, opts: { accountStates: boolean | null; isMe: boolean; canArchive: boolean }): LifecycleAction[] {
  if (opts.isMe) return [];
  if (opts.accountStates === null) return [u.isActive ? "suspend" : "reactivate"];
  if (!opts.accountStates) return [u.isActive ? "suspend" : "reactivate", "delete"];
  const status = displayStatus(u);
  if (status === "ARCHIVED") return opts.canArchive ? ["restore"] : [];
  // Suspend / reactivate keep using the existing switch (SUSPENDED or DEACTIVATED → ACTIVE, ACTIVE → SUSPENDED).
  return [u.isActive ? "suspend" : "reactivate", ...(opts.canArchive ? (["archive"] as const) : [])];
}

/** The backend's rule for a status-change reason (account-status.ts: 3–500 characters). */
export const STATUS_REASON = { min: 3, max: 500 } as const;

/** What still stops a restored account from signing in (`stillBlockedBy` from the backend), in plain words. */
const BLOCKED: Readonly<Record<string, string>> = {
  NOT_ACTIVATED: "the account has not been activated yet (the person must open their activation link)",
  PENDING_APPROVAL: "the account is still waiting for approval",
  LOCKED: "the account is temporarily locked after failed sign-ins",
  ROLE_DISABLED: "the account's role is not enabled on the platform",
};

export function stillBlockedText(codes: readonly string[] | undefined): string | null {
  const parts = (codes ?? []).map((c) => BLOCKED[c] ?? c.toLowerCase().replace(/_/g, " "));
  return parts.length ? `It still cannot sign in: ${parts.join("; ")}.` : null;
}
