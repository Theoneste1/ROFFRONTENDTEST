"use client";

/**
 * School directory administration queries (`/admin/schools`). Call these only in "manage" mode
 * (lib/admin/school-directory.ts → schoolDirectoryMode): the routes do not exist on the legacy
 * backend and need `schools.manage`.
 */
import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import { schoolDirectoryApi } from "@/lib/api/accounts";
import { adminSchoolsApi, type DirectoryListFilters } from "@/lib/api/school-directory";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { schoolDirectoryMode } from "@/lib/admin/school-directory";
import { queryKeys } from "@/lib/query/keys";

/** Which school pages to show: the directory ("manage"), the existing read-only ones, or wait. */
export function useSchoolDirectoryMode() {
  const caps = useBackendCapabilities();
  const { permissionsStatus, can } = useSession();
  return schoolDirectoryMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
}

export function useDirectorySchools(filters: DirectoryListFilters) {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.list(filters),
    queryFn: () => adminSchoolsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDirectorySchool(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.detail(id),
    queryFn: () => adminSchoolsApi.get(id),
    enabled: enabled && !!id,
  });
}

export function useDirectorySchoolStudents(id: string, page: number) {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.students(id, page),
    queryFn: () => adminSchoolsApi.students(id, { page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
}

export function useDirectorySchoolHistory(id: string, page: number) {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.history(id, page),
    queryFn: () => adminSchoolsApi.history(id, { page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
}

/** The official province → district → sector list (public; cached for an hour). */
export function useSchoolLocations() {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.locations(),
    queryFn: schoolDirectoryApi.locations,
    staleTime: 60 * 60_000,
  });
}

/**
 * After a school is created, edited, deactivated or reactivated: the directory queries and the
 * students' claim review (its list and candidate schools show school names and active state).
 * Other account queries are left alone.
 */
export function invalidateAfterSchoolChange(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.schoolDirectory.all }),
    qc.invalidateQueries({ queryKey: [...queryKeys.accounts.all, "affiliations"] }),
    qc.invalidateQueries({ queryKey: [...queryKeys.accounts.all, "candidates"] }),
  ]);
}
