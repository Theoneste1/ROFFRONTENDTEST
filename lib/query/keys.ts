/**
 * Query keys for TanStack Query. Every cached request is keyed here so that
 * mutations can invalidate exactly what they change.
 *
 * Convention: `[area, ...scope, params?]`. Invalidating a prefix such as
 * `queryKeys.me.all` refreshes everything below it.
 */
import type { MyAssignmentFilters, MyResultFilters } from "@/lib/api/assessment";
import type { ResourceFilters } from "@/lib/api/learning";
import type { ThreadScope } from "@/lib/api/community";
import type { AssignmentFilters, ReviewFilters } from "@/lib/api/mentor";
import type { AdminAssignmentFilters, AdminSubmissionFilters, AuditFilters, UserFilters, UserReportFilters } from "@/lib/api/admin";
import type { ReportFilters } from "@/lib/api/types";

export const queryKeys = {
  me: {
    all: ["me"] as const,
    profile: () => [...queryKeys.me.all, "profile"] as const,
    permissions: () => [...queryKeys.me.all, "permissions"] as const,
  },
  support: ["support"] as const,

  courses: {
    all: ["courses"] as const,
    list: () => [...queryKeys.courses.all, "list"] as const,
    mine: () => [...queryKeys.courses.all, "mine"] as const,
    detail: (courseId: string) => [...queryKeys.courses.all, "detail", courseId] as const,
    resources: (courseId: string, filters: ResourceFilters = {}) =>
      [...queryKeys.courses.all, "resources", courseId, filters] as const,
  },

  assignments: {
    all: ["assignments"] as const,
    mine: (filters: MyAssignmentFilters = {}) => [...queryKeys.assignments.all, "mine", filters] as const,
    detail: (assignmentId: string) => [...queryKeys.assignments.all, "detail", assignmentId] as const,
  },

  submissions: {
    all: ["submissions"] as const,
    detail: (submissionId: string) => [...queryKeys.submissions.all, "detail", submissionId] as const,
    history: (submissionId: string) => [...queryKeys.submissions.all, "history", submissionId] as const,
  },

  results: {
    all: ["results"] as const,
    mine: (filters: MyResultFilters = {}) => [...queryKeys.results.all, "mine", filters] as const,
    detail: (submissionId: string) => [...queryKeys.results.all, "detail", submissionId] as const,
  },

  leaderboard: {
    all: ["leaderboard"] as const,
    students: (params: { page?: number; limit?: number } = {}) => [...queryKeys.leaderboard.all, "students", params] as const,
    schools: (params: { page?: number; limit?: number } = {}) => [...queryKeys.leaderboard.all, "schools", params] as const,
    me: () => [...queryKeys.leaderboard.all, "me"] as const,
  },

  discussions: {
    all: ["discussions"] as const,
    threads: (scope: ThreadScope) => [...queryKeys.discussions.all, "threads", scope] as const,
    thread: (threadId: string) => [...queryKeys.discussions.all, "thread", threadId] as const,
    comments: (threadId: string) => [...queryKeys.discussions.all, "comments", threadId] as const,
    replies: (commentId: string) => [...queryKeys.discussions.all, "replies", commentId] as const,
  },

  notifications: {
    all: ["notifications"] as const,
    list: (params: { page?: number; limit?: number } = {}) => [...queryKeys.notifications.all, "list", params] as const,
  },

  mentor: {
    all: ["mentor"] as const,
    scopes: () => [...queryKeys.mentor.all, "scopes"] as const,
    analyticsAll: ["mentor", "analytics"] as const,
    analytics: (courseId: string, divisionId: string) => [...queryKeys.mentor.analyticsAll, courseId, divisionId] as const,
    assignmentsAll: ["mentor", "assignments"] as const,
    assignments: (filters: AssignmentFilters = {}) => [...queryKeys.mentor.assignmentsAll, "list", filters] as const,
    assignment: (id: string) => [...queryKeys.mentor.assignmentsAll, "detail", id] as const,
    assignmentHistory: (id: string) => [...queryKeys.mentor.assignmentsAll, "history", id] as const,
    reviewsAll: ["mentor", "reviews"] as const,
    reviews: (filters: ReviewFilters = {}) => [...queryKeys.mentor.reviewsAll, "queue", filters] as const,
    review: (submissionId: string) => [...queryKeys.mentor.reviewsAll, "submission", submissionId] as const,
    reviewCycles: (submissionId: string) => [...queryKeys.mentor.reviewsAll, "cycles", submissionId] as const,
    resourcesAll: ["mentor", "resources"] as const,
    resources: (courseId: string, divisionId: string) => [...queryKeys.mentor.resourcesAll, "list", courseId, divisionId] as const,
    resource: (courseId: string, resourceId: string) => [...queryKeys.mentor.resourcesAll, "detail", courseId, resourceId] as const,
  },

  /**
   * Administrator data. Most admin actions change several views (dashboard
   * counts, queues, reports), so mutations usually invalidate `admin.all`.
   */
  admin: {
    all: ["admin"] as const,
    dashboard: (filters: ReportFilters = {}) => [...queryKeys.admin.all, "dashboard", filters] as const,
    overview: () => [...queryKeys.admin.all, "overview"] as const,
    auditAll: ["admin", "audit"] as const,
    audit: (filters: AuditFilters = {}) => [...queryKeys.admin.auditAll, "list", filters] as const,
    auditEntry: (id: string) => [...queryKeys.admin.auditAll, "entry", id] as const,
    auditActions: () => [...queryKeys.admin.auditAll, "actions"] as const,
    usersAll: ["admin", "users"] as const,
    users: (filters: UserFilters = {}) => [...queryKeys.admin.usersAll, "list", filters] as const,
    user: (id: string) => [...queryKeys.admin.usersAll, "detail", id] as const,
    divisions: () => [...queryKeys.admin.all, "divisions"] as const,
    schools: (params: { search?: string; page?: number; limit?: number } = {}) => [...queryKeys.admin.all, "schools", "list", params] as const,
    school: (id: string, page = 1) => [...queryKeys.admin.all, "schools", "detail", id, page] as const,
    studentReport: (filters: UserReportFilters = {}) => [...queryKeys.admin.all, "students", "report", filters] as const,
    participation: (filters: ReportFilters = {}) => [...queryKeys.admin.all, "courses", "participation", filters] as const,
    activeScopes: () => [...queryKeys.admin.all, "mentors", "scopes", "all-active"] as const,
    assignmentsAll: ["admin", "assignments"] as const,
    assignments: (filters: AdminAssignmentFilters = {}) => [...queryKeys.admin.assignmentsAll, "list", filters] as const,
    assignmentReport: (filters: Record<string, unknown> = {}) => [...queryKeys.admin.assignmentsAll, "report", filters] as const,
    assignment: (id: string) => [...queryKeys.admin.assignmentsAll, "detail", id] as const,
    assignmentHistory: (id: string) => [...queryKeys.admin.assignmentsAll, "history", id] as const,
    submissionsAll: ["admin", "submissions"] as const,
    submissions: (filters: AdminSubmissionFilters = {}) => [...queryKeys.admin.submissionsAll, "list", filters] as const,
    submission: (id: string) => [...queryKeys.admin.submissionsAll, "detail", id] as const,
    submissionCycles: (id: string) => [...queryKeys.admin.submissionsAll, "cycles", id] as const,
    resultHistory: (id: string) => [...queryKeys.admin.submissionsAll, "result-history", id] as const,
    resultsReport: (filters: Record<string, unknown> = {}) => [...queryKeys.admin.all, "results", "report", filters] as const,
    releases: (assignmentId: string) => [...queryKeys.admin.assignmentsAll, "releases", assignmentId] as const,
    batches: (assignmentId: string) => [...queryKeys.admin.assignmentsAll, "batches", assignmentId] as const,
    scopeMentors: (courseId: string, divisionId: string) => [...queryKeys.admin.all, "mentors", "scope", courseId, divisionId] as const,
    reviewsReport: (filters: Record<string, unknown> = {}) => [...queryKeys.admin.all, "reports", "reviews", filters] as const,
    mentorReport: (filters: UserReportFilters = {}) => [...queryKeys.admin.all, "mentors", "report", filters] as const,
    mentorScopes: (mentorId: string) => [...queryKeys.admin.all, "mentors", "scopes", mentorId] as const,
    mentorRequests: (params: { status?: string; page?: number } = {}) => [...queryKeys.admin.all, "mentor-requests", params] as const,
  },
};
