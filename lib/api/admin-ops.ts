/**
 * Administrator operations: bulk e-mail (`/admin/email/*`, email.bulkSend), the
 * learning-activity log (`/admin/activity`, activity.view) and individual
 * permission overrides (`/admin/users/:id/permission-overrides`,
 * permissions.manageOverrides — Super Administrators; effective permissions and
 * the catalogue: permissions.view). Shapes follow the backend services
 * (src/email/email.service.ts, src/activity/activity.service.ts,
 * src/permission-overrides/permission-overrides.service.ts).
 */
import { api } from "./client";
import type { Page, Role } from "./types";
import type { EmailDeliveryStatus, EmailJobStatus, EmailRole, SendEmailPayload } from "../admin-ops/email";
import type { ActivityQuery, ActivityType } from "../admin-ops/activity";
import type { CreateOverridePayload, OverrideEffect, OverrideRow, PermissionCatalogue } from "../admin-ops/overrides";

// ─── Bulk e-mail ────────────────────────────────────────────────────────────

export interface EmailJob {
  id: string;
  subject: string;
  status: EmailJobStatus;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  completedAt: string | null;
  createdAt: string;
  createdBy: { id: string; username: string } | null;
}

export interface SendEmailResult extends EmailJob {
  /** True when the idempotency key had already been used: nothing new was sent. */
  alreadyExisted: boolean;
  /** The server logs e-mails instead of sending them (no e-mail provider configured). */
  dryRun?: boolean;
}

export interface EmailDelivery {
  id: string;
  recipientEmail: string;
  recipientId: string | null;
  status: EmailDeliveryStatus;
  attempts: number;
  messageId: string | null;
  errorMessage: string | null;
  attemptedAt: string | null;
}

export interface EmailUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: Role;
  gradeLevel: string | null;
  isApproved: boolean;
  isActive: boolean;
  createdAt: string;
  division: { id: string; code: string; name: string } | null;
  school: { id: string; name: string; location: string } | null;
}

export interface EmailUserFilters {
  role?: EmailRole;
  search?: string;
  schoolId?: string;
  divisionId?: string;
  isApproved?: boolean;
  page?: number;
  limit?: number;
}

/** One delivery from GET /admin/email/deliveries (never with its body). */
export interface EmailDeliveryRow {
  id: string;
  jobId: string | null;
  kind: "TRANSACTIONAL" | "BULK";
  recipientEmail: string;
  recipientId: string | null;
  subject: string | null;
  status: EmailDeliveryStatus;
  attempts: number;
  errorMessage: string | null;
  attemptedAt: string | null;
  createdAt: string;
}
export type DeliveryKind = "TRANSACTIONAL" | "BULK";

export const emailApi = {
  /** Every delivery (account and bulk e-mails); backends before it answer 404. */
  allDeliveries: (params: { status?: EmailDeliveryStatus; kind?: DeliveryKind; page?: number; limit?: number } = {}) =>
    api<Page<EmailDeliveryRow>>("/admin/email/deliveries", { query: { ...params } }),
  retryDelivery: (id: string) => api<{ message: string; deliveryId: string }>(`/admin/email/deliveries/${id}/retry`, { method: "POST" }),
  users: (filters: EmailUserFilters = {}) => api<Page<EmailUser>>("/admin/email/users", { query: { ...filters } }),
  send: (payload: SendEmailPayload) => api<SendEmailResult>("/admin/email/send", { method: "POST", body: payload }),
  jobs: (params: { page?: number; limit?: number } = {}) => api<Page<EmailJob>>("/admin/email/jobs", { query: params }),
  job: (id: string) => api<EmailJob & { idempotencyKey: string }>(`/admin/email/jobs/${id}`),
  deliveries: (id: string, params: { status?: EmailDeliveryStatus; page?: number; limit?: number } = {}) =>
    api<Page<EmailDelivery>>(`/admin/email/jobs/${id}/deliveries`, { query: params }),
  retry: (id: string) => api<{ message: string; jobId: string; requeued: number }>(`/admin/email/jobs/${id}/retry`, { method: "POST" }),
};

// ─── Activity log ───────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  userId: string;
  type: ActivityType;
  courseId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; username: string; firstName: string; lastName: string; role: Role } | null;
}

export interface ActivitySummary {
  from: string;
  to: string;
  activeUsers: number;
  byType: Partial<Record<ActivityType, number>>;
}

export const activityApi = {
  list: (q: ActivityQuery = {}) => api<Page<ActivityEntry>>("/admin/activity", { query: { ...q } }),
  summary: (range: { from?: string; to?: string } = {}) => api<ActivitySummary>("/admin/activity/summary", { query: range }),
};

// ─── Permission overrides ───────────────────────────────────────────────────

export interface EffectivePermissions {
  userId: string;
  role: Role;
  roleLabel: string | null;
  permissions: { permission: string; scope: string }[];
  overrides: { id: string; permission: string; effect: OverrideEffect; courseId: string | null; divisionId: string | null; expiresAt: string | null }[];
}

export const permissionOverridesApi = {
  list: (userId: string) => api<OverrideRow[]>(`/admin/users/${userId}/permission-overrides`),
  create: (userId: string, payload: CreateOverridePayload) => api<OverrideRow>(`/admin/users/${userId}/permission-overrides`, { method: "POST", body: payload }),
  revoke: (userId: string, overrideId: string) => api<OverrideRow>(`/admin/users/${userId}/permission-overrides/${overrideId}`, { method: "DELETE" }),
  effective: (userId: string) => api<EffectivePermissions>(`/admin/users/${userId}/permissions`),
  catalogue: () => api<PermissionCatalogue>("/admin/permissions/catalogue"),
};
