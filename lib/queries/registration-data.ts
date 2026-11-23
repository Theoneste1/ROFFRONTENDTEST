"use client";

/** Registration data (lib/admin/registration-data.ts). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { registrationDataApi, type CategoryKey, type RegistrationQuery, type SaveFilterInput } from "../admin/registration-data";
import { queryKeys } from "../query/keys";

export function useRegistrationFields(category: CategoryKey) {
  return useQuery({ queryKey: queryKeys.registrationData.fields(category), queryFn: () => registrationDataApi.fields(category), staleTime: 5 * 60_000, retry: false });
}

export function useRegistrationQuery(q: RegistrationQuery | null, page: number, limit: number) {
  return useQuery({
    queryKey: queryKeys.registrationData.query(q, page, limit),
    queryFn: () => registrationDataApi.query(q!, page, limit),
    enabled: !!q && q.columns.length > 0,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useRegistrationRecord(id: string | null) {
  return useQuery({ queryKey: queryKeys.registrationData.record(id ?? ""), queryFn: () => registrationDataApi.record(id!), enabled: !!id, retry: false });
}

export function useUpdateRegistrationRecord(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { changes: Record<string, unknown>; version?: string; currentPassword?: string }) => registrationDataApi.update(id, v.changes, v.version, v.currentPassword),
    onSuccess: (r) => {
      qc.setQueryData(queryKeys.registrationData.record(id), r);
      void qc.invalidateQueries({ queryKey: [...queryKeys.registrationData.all, "query"] });
    },
  });
}

export function useSavedFilters(category: CategoryKey) {
  return useQuery({ queryKey: queryKeys.registrationData.savedFilters(category), queryFn: () => registrationDataApi.savedFilters(category) });
}

export function useSaveFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; input: SaveFilterInput }) => (v.id ? registrationDataApi.updateFilter(v.id, v.input) : registrationDataApi.createFilter(v.input)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...queryKeys.registrationData.all, "saved-filters"] }),
  });
}

export function useDeleteFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => registrationDataApi.removeFilter(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...queryKeys.registrationData.all, "saved-filters"] }),
  });
}

export function useColumnLayout(category: CategoryKey) {
  return useQuery({ queryKey: queryKeys.registrationData.layout(category), queryFn: () => registrationDataApi.layout(category) });
}

export function useChangeColumnLayout(category: CategoryKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columns: string[] | null) => (columns ? registrationDataApi.saveLayout(category, columns) : registrationDataApi.resetLayout(category)),
    onSuccess: (l) => qc.setQueryData(queryKeys.registrationData.layout(category), l),
  });
}
