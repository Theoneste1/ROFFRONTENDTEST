"use client";

/**
 * Divisions (Olympiad levels) for every screen: the public list (`GET /divisions`), labels for codes, and the
 * Administrator's edits (capability adminDivisions). The list changes rarely; it is cached for five minutes and
 * refreshed after an Administrator's change.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { divisionsApi, mentorsApi, type BulkAssignmentInput, type DivisionInput } from "../api/admin";
import { divisionLabel, testLevelOptions, type DivisionInfo } from "../divisions/divisions";
import { queryKeys } from "../query/keys";

export function useDivisions() {
  return useQuery({ queryKey: queryKeys.divisions.list(), queryFn: () => divisionsApi.publicList() as Promise<DivisionInfo[]>, staleTime: 5 * 60_000 });
}

/** `(code) => name` from the loaded divisions (built-in names until they load). */
export function useDivisionLabel() {
  const { data } = useDivisions();
  return useCallback((code: string | null | undefined) => divisionLabel(code, data), [data]);
}

/** ALL, then every active division. */
export function useTestLevelOptions() {
  const { data } = useDivisions();
  return testLevelOptions(data);
}

function useRefreshDivisions() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.divisions.all });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.divisions() });
  };
}

export function useCreateDivision() {
  const refresh = useRefreshDivisions();
  return useMutation({ mutationFn: (input: DivisionInput & { code: string; name: string }) => divisionsApi.create(input), onSuccess: refresh });
}

export function useEditDivision() {
  const refresh = useRefreshDivisions();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: DivisionInput }) => divisionsApi.update(id, input), onSuccess: refresh });
}

export function useDivisionCourses(id: string | null) {
  return useQuery({ queryKey: queryKeys.divisions.courses(id ?? ""), queryFn: () => divisionsApi.courses(id!), enabled: !!id });
}

export function useSetDivisionCourses(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseIds: string[]) => divisionsApi.setCourses(id, courseIds),
    onSuccess: (data) => { qc.setQueryData(queryKeys.divisions.courses(id), data); },
  });
}

export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkAssignmentInput) => mentorsApi.bulkAssign(input),
    onSuccess: (r) => { if (r.applied) void qc.invalidateQueries({ queryKey: queryKeys.admin.all }); },
  });
}
