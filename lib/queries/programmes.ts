"use client";

/**
 * The programmes a Head Coach heads: `GET /programmes` filtered by
 * `scopes.programmes` from `GET /me/permissions` (the backend's own list of
 * headed programmes). No scope information → no programme is shown.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { meApi } from "@/lib/api/auth";
import { programmesApi, type ProgrammeMemberFilters } from "@/lib/api/programmes";
import { queryKeys } from "@/lib/query/keys";

export function useHeadedProgrammes() {
  // Same cache entry as the session's permissions (no extra request when already loaded).
  const permissions = useQuery({ queryKey: queryKeys.me.permissions(), queryFn: meApi.permissions, staleTime: 10 * 60_000 });
  const headed = permissions.data?.scopes?.programmes ?? [];
  const programmes = useQuery({ queryKey: queryKeys.programmes.list(), queryFn: programmesApi.list, enabled: headed.length > 0 });
  return {
    programmes: (programmes.data ?? []).filter((p) => headed.includes(p.id)),
    loading: permissions.isPending || (headed.length > 0 && programmes.isPending),
    error: permissions.error ?? programmes.error,
    retry: () => {
      void permissions.refetch();
      void programmes.refetch();
    },
  };
}

export function useProgrammeMembers(programmeId: string | null, filters: ProgrammeMemberFilters) {
  return useQuery({
    queryKey: queryKeys.programmes.members(programmeId ?? "", filters),
    queryFn: () => programmesApi.members(programmeId!, filters),
    enabled: !!programmeId,
    placeholderData: keepPreviousData,
  });
}
