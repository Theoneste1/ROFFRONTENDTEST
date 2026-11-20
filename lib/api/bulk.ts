/**
 * Generic bulk operations (capability bulkOperationsGeneric; backend docs/operations/bulk-operations.md). One engine for
 * every record type (USER, SCHOOL, SCHOOL_AFFILIATION, TEACHER_APPLICATION, COACH_APPLICATION, …):
 *
 *   GET  /admin/bulk/actions                   the record types and actions YOU may run (reason, consequence)
 *   POST /admin/bulk/:entityType/preview       what the action would do now + selectionToken (changes nothing)
 *   POST /admin/bulk/:entityType               start it on exactly the previewed records (202; 200 = same key)
 *   GET  /admin/bulk/operations                operations of every type, newest first (?entityType=, ?status=)
 *   GET  /admin/bulk/operations/:id            progress
 *   GET  /admin/bulk/operations/:id/items      per-record results (?outcome=)
 *   POST /admin/bulk/operations/:id/cancel     stop: records not yet processed are skipped
 *
 * Every route needs users.bulkManage, each action its own permission, and each record the same rules as a single
 * change; the server checks all of them.
 */
import { api } from "./client";
import type { Page } from "./types";
import type { BulkItemOutcome, BulkOperationStatus } from "./bulk-users";

export type { BulkItemOutcome, BulkOperationStatus } from "./bulk-users";

export interface BulkActionInfo {
  action: string;
  permissions: string[];
  requiresReason: boolean;
  consequence: string;
}

export interface BulkEntityTypeInfo {
  entityType: string;
  maxIds: number;
  maxSelection: number;
  export: { permission: string } | null;
  actions: BulkActionInfo[];
}

export interface BulkActionsView {
  gate: string;
  entityTypes: BulkEntityTypeInfo[];
}

/** Chosen records (≤ maxIds), or every record matching the list's filters (the list endpoint's names). */
export type RecordSelection = { mode: "ids"; ids: string[] } | { mode: "filter"; filter: Record<string, unknown> };

export interface RecordPreview {
  entityType: string;
  action: string;
  params: Record<string, unknown>;
  selection: RecordSelection;
  total: number;
  /** The record type's summaries (the same shape as an item's record). */
  sample: Record<string, unknown>[];
  warnings: { code: string; count: number; message: string }[];
  consequences: string[];
  requiresReason: boolean;
  requiresStepUp: boolean;
  selectionToken: string;
  confirmationExpiresAt?: string;
}

export interface RecordOperation {
  id: string;
  entityType: string;
  action: string;
  params: Record<string, unknown> | null;
  selection: RecordSelection | null;
  reason: string | null;
  status: BulkOperationStatus;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  actor: { id: string; username: string; firstName: string; lastName: string } | null;
  pending?: number;
  processing?: number;
  processed?: number;
}

/** One record's result; the record's summary is under the type's key (user, school, affiliation, application). */
export interface RecordItem {
  entityId: string;
  outcome: BulkItemOutcome;
  code: string | null;
  message: string | null;
  stillBlockedBy: string[];
  processedAt: string | null;
  [summaryKey: string]: unknown;
}

export interface RecordExecuteInput {
  action: string;
  params?: Record<string, unknown>;
  selection: RecordSelection;
  selectionToken: string;
  expectedTotal: number;
  confirm: true;
  idempotencyKey: string;
  reason?: string;
  currentPassword?: string;
}

const type = (entityType: string) => encodeURIComponent(entityType);

export const bulkApi = {
  actions: () => api<BulkActionsView>("/admin/bulk/actions"),
  preview: (entityType: string, body: { action: string; params?: Record<string, unknown>; selection: RecordSelection }) =>
    api<RecordPreview>(`/admin/bulk/${type(entityType)}/preview`, { method: "POST", body }),
  execute: (entityType: string, body: RecordExecuteInput) =>
    api<{ operation: RecordOperation; alreadyExisted: boolean }>(`/admin/bulk/${type(entityType)}`, { method: "POST", body }),
  list: (q: { entityType?: string; status?: BulkOperationStatus; page?: number; limit?: number } = {}) =>
    api<Page<RecordOperation>>("/admin/bulk/operations", { query: { ...q } }),
  get: (id: string) => api<RecordOperation>(`/admin/bulk/operations/${encodeURIComponent(id)}`),
  items: (id: string, q: { outcome?: BulkItemOutcome; page?: number; limit?: number } = {}) =>
    api<Page<RecordItem>>(`/admin/bulk/operations/${encodeURIComponent(id)}/items`, { query: { ...q } }),
  cancel: (id: string) => api<RecordOperation>(`/admin/bulk/operations/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};
