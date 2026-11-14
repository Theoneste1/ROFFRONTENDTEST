"use client";

/**
 * The programmes a Head Coach heads: `GET /programmes` filtered by
 * `scopes.programmes` from `GET /me/permissions` (the backend's own list of
 * headed programmes). No scope information → no programme is shown.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { meApi } from "@/lib/api/auth";
import { adminDashboardApi, coursesAdminApi, mentorsApi, usersApi } from "@/lib/api/admin";
import { teachingApi } from "@/lib/api/mentor";
import { activityApi, programmesApi, type ActivityFilters, type ProgrammeMemberFilters } from "@/lib/api/programmes";
import type { AdminDashboard } from "@/lib/api/types";
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

/** `GET /admin/dashboard` as a Head Coach gets it: no moderation or account-wide sections. */
export type ProgrammeDashboard = Omit<AdminDashboard, "reportedContent" | "accountsAwaitingSetup"> & Partial<Pick<AdminDashboard, "reportedContent" | "accountsAwaitingSetup">>;

/** Dashboard figures (reports.view); the backend limits a Head Coach to the programmes they head. */
export function useProgrammeDashboard(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.programmes.dashboard(),
    queryFn: () => adminDashboardApi.dashboard({}) as Promise<ProgrammeDashboard>,
    enabled,
  });
}

/** Course × division participation (reports.view; programme-scoped for a Head Coach, no score aggregates). */
export function useProgrammeParticipation(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.programmes.participation(),
    queryFn: () => coursesAdminApi.participation({}),
    enabled,
  });
}

/** Course analytics for one course × division (analytics.course; programme-scoped, no score aggregates). */
export function useProgrammeCourseAnalytics(courseId: string | null, divisionId: string | null) {
  return useQuery({
    queryKey: queryKeys.programmes.analytics(courseId ?? "", divisionId ?? ""),
    queryFn: () => teachingApi.analytics(courseId!, divisionId!),
    enabled: !!courseId && !!divisionId,
  });
}

export function useActivitySummary(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.programmes.activitySummary(), queryFn: activityApi.summary, enabled });
}

export function useActivityLog(filters: ActivityFilters, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.programmes.activity(filters),
    queryFn: () => activityApi.list(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Coach course × division assignments the caller may see (mentorAssignments.manage; a Head Coach: their programmes' courses). */
export function useCoachAccess(filters: { mentorId?: string; page?: number; limit?: number }, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.programmes.coachAccess(filters),
    queryFn: () => mentorsApi.scopes({ isActive: true, ...filters }),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCoachAccessAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { type: "add"; mentorId: string; courseId: string; divisionId: string } | { type: "remove"; scopeId: string }) =>
      a.type === "add" ? mentorsApi.addScope({ mentorId: a.mentorId, courseId: a.courseId, divisionId: a.divisionId }) : mentorsApi.removeScope(a.scopeId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.programmes.all });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.all });
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.all });
    },
  });
}

/** People to add to a programme (GET /admin/users, users.manage — administrators only). */
export function usePeopleSearch(search: string, role: "STUDENT" | "MENTOR", enabled: boolean) {
  const q = search.trim();
  return useQuery({
    queryKey: queryKeys.programmes.peopleSearch({ q, role }),
    queryFn: () => usersApi.list({ search: q, role, limit: 10 }),
    enabled: enabled && q.length >= 2,
    placeholderData: keepPreviousData,
  });
}

export function useMembershipAction(programmeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { type: "add" | "end"; userId: string }) =>
      a.type === "add" ? programmesApi.addMember(programmeId, a.userId) : programmesApi.endMember(programmeId, a.userId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.programmes.all });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    },
  });
}
