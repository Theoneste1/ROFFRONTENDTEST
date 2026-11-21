/**
 * An account's state history (capability accountStates): `GET /admin/users/:id/status-history`
 * (users.viewStatusHistory, Administrators and Super Administrators). Each row is one change of
 * accountStatus — who, when, from, to, reason — whether made on the user's page, by a bulk
 * operation (operationId) or by the backfill. Pure helpers; tested in tests/status-history.test.mjs.
 */
import { api } from "../api/client";
import type { Page, Permission } from "../api/types";
import { hasFeature, type BackendDetection } from "../api/capabilities";

export type AccountStatus = "ACTIVE" | "DEACTIVATED" | "SUSPENDED" | "ARCHIVED";

export interface StatusChange {
  id: string;
  fromStatus: AccountStatus | null;
  toStatus: AccountStatus;
  reason: string | null;
  actorRole: string | null;
  operationId: string | null;
  requestId: string | null;
  createdAt: string;
  actor: { id: string; username: string; firstName: string; lastName: string } | null;
}

export type StatusHistoryPage = Page<StatusChange> & { accountStatus: AccountStatus };

export const STATUS_HISTORY_PERMISSION: Permission = "users.viewStatusHistory";
export const STATUS_HISTORY_PAGE_SIZE = 10;

export const statusHistoryApi = {
  list: (userId: string, page = 1, limit = STATUS_HISTORY_PAGE_SIZE) =>
    api<StatusHistoryPage>(`/admin/users/${encodeURIComponent(userId)}/status-history`, { query: { page, limit } }),
};

const LABELS: Readonly<Record<AccountStatus, string>> = {
  ACTIVE: "Active",
  DEACTIVATED: "Deactivated",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
};

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return Object.prototype.hasOwnProperty.call(LABELS, s) ? LABELS[s as AccountStatus] : s;
}

/** "Suspended → Active" (a first state has no "from"). */
export function transitionText(c: Pick<StatusChange, "fromStatus" | "toStatus">): string {
  return c.fromStatus ? `${statusLabel(c.fromStatus)} → ${statusLabel(c.toStatus)}` : statusLabel(c.toStatus);
}

/** Who made the change: the account, a bulk operation, or "system" (no actor recorded). */
export function changedBy(c: Pick<StatusChange, "actor" | "actorRole" | "operationId">): string {
  const who = c.actor ? `${c.actor.firstName} ${c.actor.lastName} (@${c.actor.username})` : c.actorRole ? `a deleted ${c.actorRole.toLowerCase().replace("_", " ")} account` : "system";
  return c.operationId ? `${who}, bulk operation` : who;
}

/** The card is shown only with the backend feature and the known permission. */
export function statusHistoryVisible(detection: BackendDetection | null | undefined, can: (p: Permission) => boolean): boolean {
  return hasFeature(detection, "accountStates") && can(STATUS_HISTORY_PERMISSION);
}
