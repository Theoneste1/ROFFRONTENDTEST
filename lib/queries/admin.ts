"use client";

/**
 * TanStack Query hooks for the admin portal. Admin actions ripple into many
 * views (dashboard counts, queues, reports, other portals in the same
 * browser), so mutations invalidate the whole `admin` namespace plus the
 * specific non-admin caches they change.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminDashboardApi,
  auditApi,
  coursesAdminApi,
  divisionsApi,
  mentorRequestsApi,
  mentorsApi,
  schoolsApi,
  studentsApi,
  usersApi,
  type AuditFilters,
  type CreateUserInput,
  type InviteUserInput,
  type UpdateUserInput,
  type UserFilters,
  type UserReportFilters,
} from "@/lib/api/admin";
import { queryKeys } from "@/lib/query/keys";
import type { MentorRequestApproval, MentorRequestStatus, ReportFilters } from "@/lib/api/types";

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

// ─── Users ──────────────────────────────────────────────────────────────────

export function useAdminUsers(filters: UserFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.users(filters),
    queryFn: () => usersApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.user(id ?? ""),
    queryFn: () => usersApi.get(id!),
    enabled: !!id,
  });
}

export type UserAction =
  | { type: "update"; input: UpdateUserInput }
  | { type: "status"; isActive?: boolean; isApproved?: boolean }
  | { type: "resendInvitation" }
  | { type: "sendPasswordReset" }
  | { type: "delete" };

/** Every change to one account; refreshes admin views (and the mentor/student caches it may affect). */
export function useUserAction(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (a: UserAction): Promise<unknown> => {
      switch (a.type) {
        case "update":
          return usersApi.update(id, a.input);
        case "status":
          return usersApi.setStatus(id, { isActive: a.isActive, isApproved: a.isApproved });
        case "resendInvitation":
          return usersApi.resendInvitation(id);
        case "sendPasswordReset":
          return usersApi.sendPasswordReset(id);
        case "delete":
          return usersApi.remove(id);
      }
    },
    onSuccess: () => invalidate(queryKeys.leaderboard.all),
  });
}

export function useCreateUser() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (args: { mode: "create"; input: CreateUserInput } | { mode: "invite"; input: InviteUserInput }) =>
      args.mode === "create" ? usersApi.create(args.input) : usersApi.invite(args.input).then((r) => r.user),
    onSuccess: () => invalidate(),
  });
}

export function useImportUsers() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => usersApi.importCsv(file, dryRun),
    onSuccess: (r) => {
      if (!r.dryRun) invalidate();
    },
  });
}

// ─── Divisions & schools ────────────────────────────────────────────────────

export function useAdminDivisions() {
  return useQuery({
    queryKey: queryKeys.admin.divisions(),
    queryFn: divisionsApi.list,
    staleTime: 5 * 60_000,
  });
}

export function useSchools(params: { search?: string; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.schools(params),
    queryFn: () => schoolsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useSchool(id: string | undefined, page = 1) {
  return useQuery({
    queryKey: queryKeys.admin.school(id ?? "", page),
    queryFn: () => schoolsApi.get(id!, { page, limit: 20 }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

// ─── Mentors & applications ─────────────────────────────────────────────────

export function useMentorReport(filters: UserReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.mentorReport(filters),
    queryFn: () => mentorsApi.report(filters),
    placeholderData: keepPreviousData,
  });
}

/** Active course × division access of one mentor. */
export function useMentorScopes(mentorId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.mentorScopes(mentorId ?? ""),
    queryFn: () => mentorsApi.scopes({ mentorId, isActive: true, limit: 100 }),
    enabled: !!mentorId,
  });
}

export function useScopeAction() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (a: { type: "add"; mentorId: string; courseId: string; divisionId: string } | { type: "remove"; scopeId: string }) =>
      a.type === "add" ? mentorsApi.addScope({ mentorId: a.mentorId, courseId: a.courseId, divisionId: a.divisionId }) : mentorsApi.removeScope(a.scopeId),
    // A mentor signed in on this browser sees new scopes too.
    onSettled: () => invalidate(queryKeys.mentor.all),
  });
}

export function useMentorRequests(params: { status?: MentorRequestStatus; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.mentorRequests(params),
    queryFn: () => mentorRequestsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useDecideMentorRequest() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: "approve" | "reject" }): Promise<MentorRequestApproval | null> => {
      if (decision === "approve") return mentorRequestsApi.approve(id);
      await mentorRequestsApi.reject(id);
      return null;
    },
    onSettled: () => invalidate(),
  });
}

// ─── Students ───────────────────────────────────────────────────────────────

export function useStudentReport(filters: UserReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.studentReport(filters),
    queryFn: () => studentsApi.report(filters),
    placeholderData: keepPreviousData,
  });
}

// ─── Divisions & courses (edit) ─────────────────────────────────────────────

export function useUpdateDivision() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; description?: string } }) => divisionsApi.update(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useCourseParticipation(filters: ReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.participation(filters),
    queryFn: () => coursesAdminApi.participation(filters),
  });
}

export function useActiveScopes() {
  return useQuery({
    queryKey: queryKeys.admin.activeScopes(),
    queryFn: coursesAdminApi.allActiveScopes,
  });
}

export function useCourseAction() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (
      a:
        | { type: "update"; id: string; input: { title?: string; description?: string; sortOrder?: number; discussionsEnabled?: boolean } }
        | { type: "state"; id: string; action: "publish" | "unpublish" | "archive" },
    ) => (a.type === "update" ? coursesAdminApi.update(a.id, a.input) : coursesAdminApi.setState(a.id, a.action)),
    // Course lists are shared with the student and mentor views.
    onSuccess: () => invalidate(queryKeys.courses.all),
  });
}
