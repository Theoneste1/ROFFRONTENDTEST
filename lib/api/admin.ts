/**
 * Administrator endpoints (role ADMIN). Contracts follow the backend DTOs and
 * ROFBACKENDTEST/docs/api/response-schemas.json. Admins approve, distribute
 * and publish — they never grade and never create assignments.
 */
import { api, apiBlob, saveFile, type QueryValue } from "./client";
import type { AdminDashboard, AuditCategory, AuditLogEntry, Page, ReportFilters, ReportsOverview, Role } from "./types";

type Query = Record<string, QueryValue>;

/** Download an authenticated CSV export and save it. */
export async function downloadCsv(path: string, query: Query = {}, fallbackName = "export.csv"): Promise<void> {
  saveFile(await apiBlob(path, { query }, fallbackName));
}

// ─── Dashboard & overview ───────────────────────────────────────────────────

export const adminDashboardApi = {
  dashboard: (filters: ReportFilters = {}) => api<AdminDashboard>("/admin/dashboard", { query: { ...filters } }),
  overview: () => api<ReportsOverview>("/admin/reports/overview"),
};

// ─── Audit log ──────────────────────────────────────────────────────────────

export interface AuditFilters {
  category?: AuditCategory;
  /** Action name contains (case-insensitive). */
  action?: string;
  actorId?: string;
  actorRole?: Role;
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  [key: string]: QueryValue;
}

export const auditApi = {
  list: (filters: AuditFilters = {}) => api<Page<AuditLogEntry>>("/admin/audit-logs", { query: filters }),
  get: (id: string) => api<AuditLogEntry>(`/admin/audit-logs/${id}`),
  actions: () => api<{ action: string; category: AuditCategory; count: number }[]>("/admin/audit-logs/actions"),
  exportCsv: (filters: AuditFilters = {}) => {
    const { page: _p, limit: _l, ...rest } = filters;
    void _p;
    void _l;
    return downloadCsv("/admin/audit-logs/export.csv", rest, "audit-log.csv");
  },
};
