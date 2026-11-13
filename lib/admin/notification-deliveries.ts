/**
 * Notification delivery log (`/admin/notification-deliveries`): who may see it, the status and
 * type filters, labels, the Retry rule and error messages (unit-tested in
 * tests/notifications.test.mjs).
 *
 * The page and its menu item are gated by ONE permission, NOTIFICATION_DELIVERIES_PERMISSION
 * (`email.bulkSend`, held by Administrators and Super Administrators) — no new permission.
 */
import type { DeliveryFilters, DeliveryStatus, NotificationDelivery } from "../api/notification-deliveries";
import type { Permission } from "../api/types";
import { DECISION_NOTIFICATION_TYPES } from "../notifications/display";

export const NOTIFICATION_DELIVERIES_PERMISSION: Permission = "email.bulkSend";

export const DELIVERY_PAGE_SIZE = 25;

export const DELIVERY_STATUS_META: Readonly<Record<DeliveryStatus, { label: string; badge: string }>> = {
  PENDING: { label: "Waiting", badge: "bg-slate-100 text-slate-700" },
  SENDING: { label: "Sending", badge: "bg-blue-50 text-blue-700" },
  SENT: { label: "Sent", badge: "bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Failed", badge: "bg-red-50 text-red-700" },
};

/** "" = every status. */
export const DELIVERY_STATUS_FILTERS: readonly { label: string; value: DeliveryStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Failed", value: "FAILED" },
  { label: "Waiting", value: "PENDING" },
  { label: "Sending", value: "SENDING" },
  { label: "Sent", value: "SENT" },
];

const TYPE_LABELS: Readonly<Record<keyof typeof DECISION_NOTIFICATION_TYPES, string>> = {
  "school.request.verified": "School verified",
  "teacher.application.approved": "Teacher application approved",
  "coach.application.approved": "Coach application approved",
  "permissions.granted": "Permissions granted",
};

/** "" = every type. */
export const DELIVERY_TYPE_FILTERS: readonly { label: string; value: string }[] = [
  { label: "All types", value: "" },
  ...Object.entries(TYPE_LABELS).map(([value, label]) => ({ label, value })),
];

/** A readable label for a delivery's type; an unknown type is shown as is. */
export function deliveryTypeLabel(type: string): string {
  return Object.prototype.hasOwnProperty.call(TYPE_LABELS, type) ? TYPE_LABELS[type as keyof typeof TYPE_LABELS] : type;
}

/** The status label; an unknown status is shown as is. */
export function deliveryStatusLabel(status: string): string {
  return Object.prototype.hasOwnProperty.call(DELIVERY_STATUS_META, status) ? DELIVERY_STATUS_META[status as DeliveryStatus].label : status;
}

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  TeacherApplication: "Teacher application",
  MentorRequest: "Coach application",
  StudentSchoolAffiliation: "School claim",
  UserPermissionOverride: "Permission grant",
  User: "User",
};

/** The related item, e.g. "Teacher application 1a2b3c4d…" (entity type made readable, id shortened). */
export function deliveryEntityLabel(d: Pick<NotificationDelivery, "entityType" | "entityId">): string {
  const kind = ENTITY_LABELS[d.entityType] ?? d.entityType;
  const id = d.entityId.length > 12 ? `${d.entityId.slice(0, 8)}…` : d.entityId;
  return `${kind} ${id}`.trim();
}

/** Retry is offered only for a FAILED delivery (the backend refuses SENT and SENDING with 409). */
export function canRetryDelivery(d: Pick<NotificationDelivery, "status">): boolean {
  return d.status === "FAILED";
}

/** The query sent for the chosen filters ("" = not filtered). */
export function deliveryQuery(status: DeliveryStatus | "", type: string, page: number): DeliveryFilters {
  return { ...(status && { status }), ...(type && { type }), page: Math.max(1, Math.floor(page) || 1), limit: DELIVERY_PAGE_SIZE };
}

/** Whether the page is shown: the permission, once `GET /me/permissions` has answered. */
export function deliveryLogVisible(permissionsStatus: "loading" | "ready" | "error", can: (p: Permission) => boolean): boolean {
  return permissionsStatus === "ready" && can(NOTIFICATION_DELIVERIES_PERMISSION);
}

/** Message for a failed retry: 409 means the row is no longer FAILED (sent or being sent). */
export function retryErrorMessage(e: { status?: number; code?: string } | null | undefined): string | null {
  if (!e) return null;
  if (e.status === 409) return "This delivery is already sent or being sent, so it can't be retried. The list has been refreshed.";
  if (e.status === 404) return "This delivery no longer exists. The list has been refreshed.";
  return null;
}
