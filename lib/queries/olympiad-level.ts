"use client";

/** A student's Olympiad level and its history (lib/accounts/olympiad-level.ts). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { olympiadLevelApi, type SetLevelInput } from "../accounts/olympiad-level";
import { queryKeys } from "../query/keys";

export function useOlympiadLevel(studentId: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.olympiadLevel(studentId), queryFn: () => olympiadLevelApi.view(studentId), enabled });
}

export function useSetOlympiadLevel(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SetLevelInput) => olympiadLevelApi.set(studentId, input),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.olympiadLevel(studentId), data);
      // The level shows on the user's page, lists, the profile overview and test screens.
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
      void qc.invalidateQueries({ queryKey: queryKeys.overview(studentId) });
      void qc.invalidateQueries({ queryKey: queryKeys.divisions.all });
    },
  });
}
