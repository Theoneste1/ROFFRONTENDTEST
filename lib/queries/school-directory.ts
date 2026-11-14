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
import { syncAccess } from "@/lib/admin/school-sync";
import { schoolSyncApi, type SyncChangeKind, type SyncDecision, type SyncItemOutcome } from "@/lib/api/school-sync";
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

// ─── Contacts, offerings, reference data ────────────────────────────────────

export function useSchoolContacts(id: string, includeRemoved = false) {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.contacts(id, includeRemoved),
    queryFn: () => adminSchoolsApi.contacts(id, includeRemoved),
  });
}

export function useSchoolOfferings(id: string) {
  return useQuery({ queryKey: queryKeys.schoolDirectory.offerings(id), queryFn: () => adminSchoolsApi.offerings(id) });
}

/** Education levels and programmes (changes rarely). */
export function useSchoolReferenceData(enabled = true) {
  return useQuery({ queryKey: queryKeys.schoolDirectory.referenceData(), queryFn: adminSchoolsApi.referenceData, staleTime: 10 * 60_000, enabled });
}

// ─── Directory sync ─────────────────────────────────────────────────────────

/** Who may see the directory sync and who may approve / apply it (capability + permissions, never role). */
export function useSyncAccess() {
  const caps = useBackendCapabilities();
  const { permissionsStatus, can } = useSession();
  return syncAccess({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
}

export function useSyncRuns(page: number, enabled = true) {
  return useQuery({ queryKey: queryKeys.schoolSync.runs(page), queryFn: () => schoolSyncApi.runs({ page, limit: 20 }), placeholderData: keepPreviousData, enabled });
}

export function useSyncRun(id: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.schoolSync.run(id), queryFn: () => schoolSyncApi.run(id), enabled: enabled && !!id });
}

export function useSyncReview(id: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.schoolSync.review(id), queryFn: () => schoolSyncApi.review(id), enabled: enabled && !!id });
}

export function useSyncCategories(id: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.schoolSync.categories(id), queryFn: () => schoolSyncApi.categories(id), enabled: enabled && !!id });
}

export function useSyncItems(id: string, filters: { page: number; outcome?: SyncItemOutcome }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.schoolSync.items(id, filters),
    queryFn: () => schoolSyncApi.items(id, { ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
    enabled: enabled && !!id,
  });
}

export function useSyncChanges(id: string, filters: { page: number; kind?: SyncChangeKind; decision?: SyncDecision }, enabled = true) {
  return useQuery({
    queryKey: queryKeys.schoolSync.changes(id, filters),
    queryFn: () => schoolSyncApi.changes(id, { ...filters, limit: 20 }),
    placeholderData: keepPreviousData,
    enabled: enabled && !!id,
  });
}

/** After any review action: the run's queries (and, after apply, the directory). */
export function invalidateSyncRun(qc: QueryClient, applied = false) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.schoolSync.all }),
    ...(applied ? [qc.invalidateQueries({ queryKey: queryKeys.schoolDirectory.all })] : []),
  ]);
}
