/** Leaderboard, discussions and notifications. */
import { api } from "./client";
import type {
  AppNotification,
  DiscussionComment,
  DiscussionThread,
  LeaderboardPage,
  MyRank,
  Page,
  ReactionType,
  ReportReason,
  SchoolLeaderboardPage,
} from "./types";

export const leaderboardApi = {
  /** Students of a division (default: the caller's), ranked by points. */
  students: (params: { page?: number; limit?: number; divisionId?: string; schoolId?: string } = {}) =>
    api<LeaderboardPage>("/leaderboard", { query: params }),
  me: () => api<MyRank>("/leaderboard/me"),
  schools: (params: { page?: number; limit?: number; divisionId?: string } = {}) =>
    api<SchoolLeaderboardPage>("/leaderboard/schools", { query: params }),
};

export type ThreadScope = { kind: "course"; courseId: string; divisionId?: string } | { kind: "assignment"; assignmentId: string };

function scopePath(scope: ThreadScope): string {
  return scope.kind === "course" ? `/courses/${scope.courseId}/threads` : `/assignments/${scope.assignmentId}/threads`;
}

export const discussionsApi = {
  threads: (scope: ThreadScope, params: { page?: number; limit?: number } = {}) =>
    api<Page<DiscussionThread>>(scopePath(scope), {
      query: { ...params, divisionId: scope.kind === "course" ? scope.divisionId : undefined },
    }),
  createThread: (scope: ThreadScope, title: string, content: string) =>
    api<DiscussionThread>(scopePath(scope), {
      method: "POST",
      body: { title: title.trim(), content: content.trim(), ...(scope.kind === "course" && scope.divisionId ? { divisionId: scope.divisionId } : {}) },
    }),
  thread: (threadId: string) => api<DiscussionThread>(`/threads/${threadId}`),
  comments: (threadId: string, params: { page?: number; limit?: number } = {}) =>
    api<Page<DiscussionComment>>(`/threads/${threadId}/comments`, { query: params }),
  replies: (commentId: string, params: { page?: number; limit?: number } = {}) =>
    api<Page<DiscussionComment>>(`/comments/${commentId}/replies`, { query: params }),
  addComment: (threadId: string, content: string, parentId?: string) =>
    api<DiscussionComment>(`/threads/${threadId}/comments`, {
      method: "POST",
      body: parentId ? { content: content.trim(), parentId } : { content: content.trim() },
    }),
  editComment: (commentId: string, content: string) =>
    api<DiscussionComment>(`/comments/${commentId}`, { method: "PATCH", body: { content: content.trim() } }),
  deleteComment: (commentId: string) => api<{ message: string }>(`/comments/${commentId}`, { method: "DELETE" }),
  /** Toggles the caller's reaction. */
  react: (commentId: string, type: ReactionType) =>
    api<unknown>(`/comments/${commentId}/reactions`, { method: "POST", body: { type } }),
  reportComment: (commentId: string, reason: ReportReason, details?: string) =>
    api<unknown>(`/comments/${commentId}/report`, { method: "POST", body: details?.trim() ? { reason, details: details.trim() } : { reason } }),
};

export const notificationsApi = {
  list: (params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
    api<Page<AppNotification>>("/notifications", { query: params }),
};
