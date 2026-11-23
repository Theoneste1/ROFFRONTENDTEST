"use client";

/** TanStack Query hooks for bulk e-mail, the activity log and permission overrides (lib/api/admin-ops.ts). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activityApi, emailApi, permissionOverridesApi, type DeliveryKind, type EmailUserFilters } from "@/lib/api/admin-ops";
import type { ActivityQuery } from "@/lib/admin-ops/activity";
import type { EmailDeliveryStatus, SendEmailPayload } from "@/lib/admin-ops/email";
import { isJobRunning } from "@/lib/admin-ops/email";
import type { CreateOverridePayload } from "@/lib/admin-ops/overrides";
import { queryKeys } from "@/lib/query/keys";

// ─── Bulk e-mail ────────────────────────────────────────────────────────────

export function useEmailUsers(filters: EmailUserFilters, enabled = true) {
  return useQuery({ queryKey: queryKeys.admin.emailUsers(filters), queryFn: () => emailApi.users(filters), placeholderData: keepPreviousData, enabled });
}

export function useEmailJobs(params: { page?: number; limit?: number }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.emailJobs(params),
    queryFn: () => emailApi.jobs(params),
    placeholderData: keepPreviousData,
    enabled,
    // Keep counters moving while any listed job is still being sent.
    refetchInterval: (q) => (q.state.data?.data.some((j) => isJobRunning(j.status)) ? 4000 : false),
  });
}

export function useEmailJob(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.emailJob(id),
    queryFn: () => emailApi.job(id),
    enabled,
    refetchInterval: (q) => (q.state.data && isJobRunning(q.state.data.status) ? 3000 : false),
  });
}

/**
 * `progress` (the job's status and counters) is part of the key: when the job's counters move —
 * including the last change, after which polling stops — the deliveries are fetched again.
 */
export function useEmailDeliveries(id: string, params: { status?: EmailDeliveryStatus; page?: number; limit?: number }, running: boolean, progress: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.admin.emailDeliveries(id, params), progress],
    queryFn: () => emailApi.deliveries(id, params),
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: running ? 3000 : false,
  });
}

/** Failed (or, with the e-mail budget, DISCARDED) deliveries of every kind (no retries on error: older backends answer 404). */
export function useFailedDeliveries(params: { kind?: DeliveryKind; page?: number; limit?: number; status?: "FAILED" | "DISCARDED" }) {
  return useQuery({
    queryKey: [...queryKeys.admin.emailAll, "failed", params],
    queryFn: () => emailApi.allDeliveries({ ...params, status: params.status ?? "FAILED" }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** The sending budget (capability emailBudget), refreshed every minute while the page is open. */
export function useEmailUsage(enabled = true) {
  return useQuery({ queryKey: [...queryKeys.admin.emailAll, "usage"], queryFn: emailApi.usage, enabled, refetchInterval: 60_000, retry: false });
}

export function useRecoverQuotaFailures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => emailApi.recoverQuotaFailures(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.admin.emailAll }),
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => emailApi.retryDelivery(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.admin.emailAll }),
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendEmailPayload) => emailApi.send(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.admin.emailAll }),
  });
}

export function useRetryEmailJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => emailApi.retry(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.admin.emailAll });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.overview() });
    },
  });
}

// ─── Activity ───────────────────────────────────────────────────────────────

export function useActivity(q: ActivityQuery, enabled = true) {
  return useQuery({ queryKey: queryKeys.admin.activity(q), queryFn: () => activityApi.list(q), placeholderData: keepPreviousData, enabled });
}

export function useActivitySummary(range: { from?: string; to?: string }, enabled = true) {
  return useQuery({ queryKey: queryKeys.admin.activitySummary(range), queryFn: () => activityApi.summary(range), placeholderData: keepPreviousData, enabled });
}

// ─── Permission overrides ───────────────────────────────────────────────────

export function usePermissionCatalogue(enabled = true) {
  return useQuery({ queryKey: queryKeys.admin.permissionCatalogue(), queryFn: permissionOverridesApi.catalogue, staleTime: 10 * 60_000, enabled });
}

export function useEffectivePermissions(userId: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.admin.effectivePermissions(userId), queryFn: () => permissionOverridesApi.effective(userId), enabled });
}

export function useOverrides(userId: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.admin.overrides(userId), queryFn: () => permissionOverridesApi.list(userId), enabled });
}

export function useOverrideMutations(userId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.admin.permissionsOf(userId) });
  const create = useMutation({ mutationFn: (payload: CreateOverridePayload) => permissionOverridesApi.create(userId, payload), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (overrideId: string) => permissionOverridesApi.revoke(userId, overrideId), onSuccess: refresh });
  return { create, revoke };
}
