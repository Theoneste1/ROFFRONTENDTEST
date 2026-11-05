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
};
