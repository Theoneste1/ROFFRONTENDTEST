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
  assignmentsAdminApi,
  auditApi,
  coursesAdminApi,
  divisionsApi,
  mentorRequestsApi,
  mentorsApi,
  moderationApi,
  reportsApi,
  resultsAdminApi,
  schoolsApi,
  settingsApi,
  submissionsAdminApi,
  studentsApi,
  usersApi,
  type AdminAssignmentFilters,
  type AdminSubmissionFilters,
  type AuditFilters,
  type CreateUserInput,
  type InviteUserInput,
  type UpdateUserInput,
  type UserFilters,
  type ResolveAction,
  type ThreadOp,
  type UserReportFilters,
} from "@/lib/api/admin";
import { mentorAssignmentsApi, reviewsApi } from "@/lib/api/mentor";
import { queryKeys } from "@/lib/query/keys";
import type { AssignmentStatus, DistributionStrategy, MentorRequestApproval, MentorRequestStatus, ReportFilters, ReportReason, ReportStatus, SettingValue } from "@/lib/api/types";

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
    placeholderData: keepPreviousData,
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
    placeholderData: keepPreviousData,
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

// ─── Assignments ────────────────────────────────────────────────────────────

export function useAdminAssignments(filters: AdminAssignmentFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.assignments(filters),
    queryFn: () => assignmentsAdminApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

/** Submission and review figures per assignment (first 100 matching the filters). */
export function useAssignmentReport(filters: ReportFilters & { status?: AssignmentStatus } = {}) {
  const f = { ...filters, limit: 100 };
  return useQuery({
    queryKey: queryKeys.admin.assignmentReport(f),
    queryFn: () => assignmentsAdminApi.report(f),
    placeholderData: keepPreviousData,
  });
}

export function useAdminAssignment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.assignment(id ?? ""),
    queryFn: () => mentorAssignmentsApi.get(id!),
    enabled: !!id,
  });
}

export function useAdminAssignmentHistory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.assignmentHistory(id ?? ""),
    queryFn: () => mentorAssignmentsApi.history(id!),
    enabled: !!id,
  });
}

export type AssignmentAdminAction =
  | { type: "publish" }
  | { type: "reject"; note: string }
  | { type: "unpublish" }
  | { type: "close"; note?: string }
  | { type: "reopen"; note?: string; deadline?: string }
  | { type: "archive" };

export function useAssignmentAdminAction(id: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (a: AssignmentAdminAction) => {
      switch (a.type) {
        case "publish":
          return assignmentsAdminApi.publish(id);
        case "reject":
          return assignmentsAdminApi.reject(id, a.note);
        case "unpublish":
          return assignmentsAdminApi.unpublish(id);
        case "close":
          return assignmentsAdminApi.close(id, a.note);
        case "reopen":
          return assignmentsAdminApi.reopen(id, { note: a.note, deadline: a.deadline });
        case "archive":
          return assignmentsAdminApi.archive(id);
      }
    },
    // Mentor and student assignment views in the same browser change too.
    onSettled: () => invalidate(queryKeys.mentor.assignmentsAll, queryKeys.assignments.all, queryKeys.courses.all),
  });
}

// ─── Submissions & distribution ─────────────────────────────────────────────

export function useAdminSubmissions(filters: AdminSubmissionFilters = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.submissions(filters),
    queryFn: () => submissionsAdminApi.list(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDistributionBatches(assignmentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.batches(assignmentId ?? ""),
    queryFn: () => submissionsAdminApi.batches(assignmentId!),
    enabled: !!assignmentId,
  });
}

/** Mentors with active access to a course × division (candidates for distribution). */
export function useScopeMentors(courseId: string | undefined, divisionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.scopeMentors(courseId ?? "", divisionId ?? ""),
    queryFn: async () => (await mentorsApi.scopes({ courseId, divisionId, isActive: true, limit: 100 })).data.map((s) => s.mentor),
    enabled: !!courseId && !!divisionId,
  });
}

function useInvalidateReviews() {
  const invalidate = useInvalidateAdmin();
  // Mentor review queues in the same browser change too.
  return () => invalidate(queryKeys.mentor.reviewsAll, queryKeys.mentor.analyticsAll);
}

export function useDistribute(assignmentId: string) {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: (input: { strategy?: DistributionStrategy; mentorIds?: string[] }) => submissionsAdminApi.distribute(assignmentId, input),
    onSettled: invalidate,
  });
}

export function useAssignSubmission() {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: ({ submissionId, mentorId, reassign }: { submissionId: string; mentorId: string; reassign: boolean }) =>
      reassign ? submissionsAdminApi.reassign(submissionId, mentorId) : submissionsAdminApi.assign(submissionId, mentorId),
    onSettled: invalidate,
  });
}

// ─── Review approval ────────────────────────────────────────────────────────

export function useAdminSubmission(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.submission(id ?? ""),
    queryFn: () => submissionsAdminApi.get(id!),
    enabled: !!id,
  });
}

export function useAdminReviewCycles(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.submissionCycles(id ?? ""),
    queryFn: () => reviewsApi.cycles(id!),
    enabled: !!id,
  });
}

export type ReviewDecision = { type: "approve"; note?: string } | { type: "sendBack"; reason: string };

export function useReviewDecision(submissionId: string) {
  const invalidate = useInvalidateReviews();
  return useMutation({
    mutationFn: (d: ReviewDecision) => (d.type === "approve" ? submissionsAdminApi.approve(submissionId, d.note) : submissionsAdminApi.sendBack(submissionId, d.reason)),
    onSettled: invalidate,
  });
}

// ─── Result publication ─────────────────────────────────────────────────────

export function useResultsReport(filters: ReportFilters & { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.resultsReport({ ...filters }),
    queryFn: () => resultsAdminApi.report(filters),
    placeholderData: keepPreviousData,
  });
}

export function useResultReleases(assignmentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.releases(assignmentId ?? ""),
    queryFn: () => resultsAdminApi.releases(assignmentId!),
    enabled: !!assignmentId,
  });
}

export function useResultHistory(submissionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.admin.resultHistory(submissionId ?? ""),
    queryFn: () => submissionsAdminApi.resultHistory(submissionId!),
    enabled: !!submissionId && enabled,
  });
}

/** Publishing changes students' results, points and the leaderboard. */
function useInvalidateResults() {
  const invalidate = useInvalidateAdmin();
  return () => invalidate(queryKeys.results.all, queryKeys.leaderboard.all, queryKeys.mentor.reviewsAll, queryKeys.mentor.analyticsAll);
}

export function usePublishAll(assignmentId: string) {
  const invalidate = useInvalidateResults();
  return useMutation({
    mutationFn: (note?: string) => resultsAdminApi.publishAll(assignmentId, note),
    onSettled: invalidate,
  });
}

export function useResultAction(submissionId: string) {
  const invalidate = useInvalidateResults();
  return useMutation({
    mutationFn: (a: { type: "publish" } | { type: "reopen"; note: string }) =>
      a.type === "publish" ? submissionsAdminApi.publish(submissionId) : submissionsAdminApi.reopen(submissionId, a.note),
    onSettled: invalidate,
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────

export function useReviewsReport(filters: ReportFilters = {}) {
  return useQuery({
    queryKey: queryKeys.admin.reviewsReport({ ...filters }),
    queryFn: () => reportsApi.reviews(filters),
    placeholderData: keepPreviousData,
  });
}

// ─── Moderation ─────────────────────────────────────────────────────────────

export function useModerationReports(params: { status?: ReportStatus; reason?: ReportReason; targetType?: "THREAD" | "COMMENT"; page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.moderationReports({ ...params }),
    queryFn: () => moderationApi.reports(params),
    placeholderData: keepPreviousData,
  });
}

export function useModerationReport(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.moderationReport(id ?? ""),
    queryFn: () => moderationApi.report(id!),
    enabled: !!id,
  });
}

export function useModerationActions(page = 1) {
  return useQuery({
    queryKey: queryKeys.admin.moderationActions(page),
    queryFn: () => moderationApi.actions({ page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
}

export function useHiddenComments(page = 1) {
  return useQuery({
    queryKey: queryKeys.admin.hiddenComments(page),
    queryFn: () => moderationApi.hiddenComments({ page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
}

export type ModerationMutation =
  | { type: "resolve"; reportId: string; action: ResolveAction; note?: string }
  | { type: "comment"; commentId: string; op: "hide" | "restore"; reason?: string }
  | { type: "thread"; threadId: string; op: ThreadOp; reason?: string };

export function useModerate() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (m: ModerationMutation) =>
      m.type === "resolve" ? moderationApi.resolve(m.reportId, m.action, m.note) : m.type === "comment" ? moderationApi.comment(m.commentId, m.op, m.reason) : moderationApi.thread(m.threadId, m.op, m.reason),
    onSettled: () => invalidate(queryKeys.discussions.all),
  });
}

// ─── Platform settings ──────────────────────────────────────────────────────

export function usePlatformSettings() {
  return useQuery({ queryKey: queryKeys.admin.settings(), queryFn: settingsApi.list });
}

export function useUpdateSettings() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (changes: Record<string, SettingValue>) => settingsApi.update(changes),
    // Support details are public (login page, help).
    onSettled: () => invalidate(queryKeys.support),
  });
}

export function useRecomputeLeaderboard() {
  const invalidate = useInvalidateAdmin();
  return useMutation({ mutationFn: settingsApi.recomputeLeaderboard, onSettled: () => invalidate(queryKeys.leaderboard.all) });
}
