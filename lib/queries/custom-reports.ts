"use client";

/** Custom reports (lib/reports/custom-reports.ts). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customReportsApi, type GrantInput, type SaveReportInput } from "../reports/custom-reports";
import { queryKeys } from "../query/keys";

export function useReportCatalogue(enabled = true) {
  return useQuery({ queryKey: queryKeys.reports.sources(), queryFn: customReportsApi.catalogue, staleTime: 10 * 60_000, enabled, retry: false });
}
export function useReports(enabled = true) {
  return useQuery({ queryKey: queryKeys.reports.list(), queryFn: customReportsApi.list, enabled });
}
export function useReport(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.reports.one(id ?? ""), queryFn: () => customReportsApi.get(id!), enabled: !!id });
}
export function useReportRun(id: string, page: number) {
  return useQuery({ queryKey: queryKeys.reports.run(id, page), queryFn: () => customReportsApi.run(id, page), placeholderData: keepPreviousData });
}
export function useReportGrants(id: string) {
  return useQuery({ queryKey: queryKeys.reports.grants(id), queryFn: () => customReportsApi.grants(id) });
}

export function useSaveReport(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveReportInput) => (id ? customReportsApi.update(id, input) : customReportsApi.create(input)),
    onSuccess: (r) => {
      qc.setQueryData(queryKeys.reports.one(r.id), r);
      void qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    },
  });
}
export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => customReportsApi.remove(id), onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.reports.all }) });
}
export function useSetGrants(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grants: GrantInput[]) => customReportsApi.setGrants(id, grants),
    onSuccess: (data) => qc.setQueryData(queryKeys.reports.grants(id), data),
  });
}
