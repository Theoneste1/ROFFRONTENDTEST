/**
 * Admin delivery log of the decision notifications (the backend's NotificationOutbox).
 *
 *   GET  /admin/notification-deliveries?status=&type=&page&limit   email.bulkSend  paginated rows
 *   POST /admin/notification-deliveries/:id/retry                  email.bulkSend  re-queue a FAILED row
 *                                                                  (409 when SENT or SENDING)
 *
 * The message body (payload) is never returned.
 */
import { api } from "./client";
import type { Page } from "./types";

export type DeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export interface NotificationDelivery {
  id: string;
  type: string;
  recipientEmail: string;
  recipientUserId: string | null;
  entityType: string;
  entityId: string;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  nextAttemptAt: string | null;
}

export interface DeliveryFilters {
  status?: DeliveryStatus;
  type?: string;
  page?: number;
  limit?: number;
}

export const notificationDeliveriesApi = {
  list: (filters: DeliveryFilters = {}) => api<Page<NotificationDelivery>>("/admin/notification-deliveries", { query: { ...filters } }),
  retry: (id: string) => api<NotificationDelivery>(`/admin/notification-deliveries/${encodeURIComponent(id)}/retry`, { method: "POST" }),
};
