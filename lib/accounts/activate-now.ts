/**
 * "Activate now" on an administrator's user page (capability adminActivateNow, owner 2026-11-24): an account "Awaiting
 * setup" (never activated) whose person chose their own password can be activated by an administrator, so the person
 * signs in without confirming their e-mail. Pure; unit-tested in tests/activate-now.test.mjs. The backend checks every
 * rule again (users.changeStatus, the role rule, the account's state) and refuses in plain words.
 */
import type { AdminUser } from "../api/types";

export interface ActivateNowContext {
  /** The backend advertises adminActivateNow. */
  featureOn: boolean;
  /** The administrator holds users.changeStatus. */
  canChangeStatus: boolean;
  /** The account is the administrator's own. */
  isMe: boolean;
}

/** Shown for an active account awaiting setup whose person has a password (an invited person uses Resend invitation). */
export function activateNowVisible(user: Pick<AdminUser, "activatedAt" | "isActive" | "hasPassword" | "accountStatus">, ctx: ActivateNowContext): boolean {
  if (!ctx.featureOn || !ctx.canChangeStatus || ctx.isMe) return false;
  if (user.activatedAt || !user.isActive) return false;
  if (user.accountStatus !== undefined && user.accountStatus !== "ACTIVE") return false;
  return user.hasPassword === true;
}

/** The confirmation's text. */
export function activateNowConfirmText(name: string): string {
  return `${name} will be able to sign in at once, without confirming their e-mail. Their unused confirmation links stop working. No e-mail is sent.`;
}

const STILL_BLOCKED: Readonly<Record<string, string>> = {
  PENDING_APPROVAL: "the account still waits for approval (approve it so they can sign in)",
  LOCKED: "the account is locked for a while after failed sign-ins (it unlocks by itself)",
  ROLE_DISABLED: "their role is switched off on this platform",
};

/** The success notice: who can now sign in, or what still stops them. */
export function activateNowDoneText(name: string, stillBlockedBy: readonly string[] | undefined): string {
  const blocks = (stillBlockedBy ?? []).filter((b) => b !== "NOT_ACTIVATED");
  if (blocks.length === 0) return `${name}'s account is active. They can sign in now.`;
  return `${name}'s account is activated, but ${blocks.map((b) => STILL_BLOCKED[b] ?? b.toLowerCase()).join("; ")}.`;
}
