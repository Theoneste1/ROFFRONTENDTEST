"use client";

/**
 * TanStack Query hooks for the admin portal. Admin actions ripple into many
 * views (dashboard counts, queues, reports, other portals in the same
 * browser), so mutations invalidate the whole `admin` namespace plus the
 * specific non-admin caches they change.
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminDashboardApi, auditApi, type AuditFilters } from "@/lib/api/admin";
import { queryKeys } from "@/lib/query/keys";
import type { ReportFilters } from "@/lib/api/types";

/** Invalidate every admin view (call after any admin mutation). */
export function useInvalidateAdmin() {
  const qc = useQueryClient();
  return (...extra: (readonly unknown[])[]) => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    for (const key of extra) void qc.invalidateQueries({ queryKey: key });
  };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function useAdminDashboard(filters: ReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.dashboard(filters),
    queryFn: () => adminDashboardApi.dashboard(filters),
  });
}

export function useReportsOverview() {
  return useQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: adminDashboardApi.overview,
  });
}

// ─── Audit log ──────────────────────────────────────────────────────────────

export function useAuditLog(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.audit(filters),
    queryFn: () => auditApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAuditEntry(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.auditEntry(id ?? ""),
    queryFn: () => auditApi.get(id!),
    enabled: !!id,
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: queryKeys.admin.auditActions(),
    queryFn: auditApi.actions,
    staleTime: 5 * 60_000,
  });
}
