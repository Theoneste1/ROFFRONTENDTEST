/**
 * Bulk user operations (capability bulkUserOperations; backend docs/operations/bulk-user-operations.md):
 *
 *   POST /admin/users/bulk/preview     users.bulkManage  what the action would do now + selectionToken (changes nothing)
 *   POST /admin/users/bulk             users.bulkManage  start it on exactly the previewed accounts (202; 200 = same
 *                                                         idempotencyKey already used); 409 SELECTION_CHANGED
 *   GET  /admin/users/bulk             users.bulkManage  operations, newest first (own; all with audit.view)
 *   GET  /admin/users/bulk/:id         users.bulkManage  progress
 *   GET  /admin/users/bulk/:id/items   users.bulkManage  per-account results (?outcome=)
 *   POST /admin/users/bulk/:id/cancel  users.bulkManage  stop: unprocessed accounts are skipped
 *   POST /admin/users/bulk/export      users.export      CSV of the selected accounts (no dates of birth or phones)
 *
 * Each action also needs its own permission and each account the usual role policy; the server checks both.
 */
import { api, apiBlob, type DownloadedFile } from "./client";
import type { GradeLevel, Page, Role } from "./types";

export type BulkAction = "activate" | "deactivate" | "suspend" | "archive" | "restore" | "assignRole" | "changeClassification" | "message";

/** The filters of GET /admin/users (JSON booleans). */
export interface BulkFilter {
  role?: Role;
  divisionId?: string;
  gradeLevel?: GradeLevel;
  schoolId?: string;
  isApproved?: boolean;
  isActive?: boolean;
  accountStatus?: string;
  isActivated?: boolean;
  search?: string;
}

/** Up to 1000 chosen accounts, or every account matching the filters across all pages (at most 50 000). */
export type BulkSelection = { mode: "ids"; ids: string[] } | { mode: "filter"; filter: BulkFilter };

export interface BulkParams {
  role?: Role;
  gradeLevel?: GradeLevel;
  subject?: string;
  body?: string;
}

export interface BulkAccount {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  role: Role;
  accountStatus: string;
}

export interface BulkPreview {
  action: BulkAction;
  params: BulkParams;
  selection: BulkSelection;
  total: number;
  sample: BulkAccount[];
  warnings: { code: string; count: number; message: string }[];
  consequences: string[];
  requiresReason: boolean;
  requiresStepUp: boolean;
  selectionToken: string;
}

export type BulkOperationStatus = "PENDING" | "RUNNING" | "CANCELLING" | "COMPLETED" | "COMPLETED_WITH_FAILURES" | "FAILED" | "CANCELLED";
export type BulkItemOutcome = "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "SKIPPED";

export interface BulkOperation {
  id: string;
  action: BulkAction | string;
  params: BulkParams | null;
  selection: BulkSelection | null;
  reason: string | null;
  status: BulkOperationStatus;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  idempotencyKey: string;
  emailJobId: string | null;
  requestId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  actorRole: string;
  actor: { id: string; username: string; firstName: string; lastName: string } | null;
  /** GET /:id and cancel only. */
  pending?: number;
  processing?: number;
  processed?: number;
}

export interface BulkItem {
  userId: string;
  outcome: BulkItemOutcome;
  code: string | null;
  message: string | null;
  stillBlockedBy: string[];
  processedAt: string | null;
  user: BulkAccount | null;
}

export interface BulkExecuteInput {
  action: BulkAction;
  params?: BulkParams;
  selection: BulkSelection;
  selectionToken: string;
  expectedTotal: number;
  confirm: true;
  idempotencyKey: string;
  reason?: string;
  currentPassword?: string;
}

export const bulkUsersApi = {
  preview: (body: { action: BulkAction; params?: BulkParams; selection: BulkSelection }) =>
    api<BulkPreview>("/admin/users/bulk/preview", { method: "POST", body }),
  execute: (body: BulkExecuteInput) => api<{ operation: BulkOperation; alreadyExisted: boolean }>("/admin/users/bulk", { method: "POST", body }),
  list: (q: { status?: BulkOperationStatus; page?: number; limit?: number } = {}) => api<Page<BulkOperation>>("/admin/users/bulk", { query: { ...q } }),
  get: (id: string) => api<BulkOperation>(`/admin/users/bulk/${encodeURIComponent(id)}`),
  items: (id: string, q: { outcome?: BulkItemOutcome; page?: number; limit?: number } = {}) =>
    api<Page<BulkItem>>(`/admin/users/bulk/${encodeURIComponent(id)}/items`, { query: { ...q } }),
  cancel: (id: string) => api<BulkOperation>(`/admin/users/bulk/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
  export: (selection: BulkSelection): Promise<DownloadedFile> =>
    apiBlob("/admin/users/bulk/export", { method: "POST", body: { selection } }, `users-${new Date().toISOString().slice(0, 10)}.csv`),
};
