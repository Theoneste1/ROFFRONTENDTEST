"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { discussionsApi, leaderboardApi, notificationsApi, type ThreadScope } from "@/lib/api/community";
import { queryKeys } from "@/lib/query/keys";
import type { ReactionType, ReportReason } from "@/lib/api/types";

// ─── Leaderboard ────────────────────────────────────────────────────────────

export function useLeaderboard(params: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.leaderboard.students(params),
    queryFn: () => leaderboardApi.students(params),
    placeholderData: keepPreviousData,
  });
}

export function useSchoolLeaderboard(params: { page?: number; limit?: number } = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.leaderboard.schools(params),
    queryFn: () => leaderboardApi.schools(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useMyRank() {
  return useQuery({ queryKey: queryKeys.leaderboard.me(), queryFn: leaderboardApi.me });
}

/**
 * The student directly above the caller (the "next milestone"). With ties,
 * RANK() skips numbers, so the row is found by position, not by rank value.
 */
export function useEntryAbove(myRank: number | undefined) {
  const position = myRank && myRank > 1 ? myRank - 1 : null; // 1-based position of the row above
  const limit = 100;
  const page = position ? Math.floor((position - 1) / limit) + 1 : 1;
  return useQuery({
    queryKey: queryKeys.leaderboard.students({ page, limit }),
    queryFn: () => leaderboardApi.students({ page, limit }),
    enabled: position !== null,
    select: (res) => (position ? (res.data[(position - 1) % limit] ?? null) : null),
  });
}

// ─── Notifications ──────────────────────────────────────────────────────────

export function useNotifications(params: { page?: number; limit?: number } = {}) {
  return useQuery({ queryKey: queryKeys.notifications.list(params), queryFn: () => notificationsApi.list(params) });
}

// ─── Discussions ────────────────────────────────────────────────────────────

export function useThreads(scope: ThreadScope | null) {
  return useQuery({
    queryKey: scope ? queryKeys.discussions.threads(scope) : ["discussions", "none"],
    queryFn: () => discussionsApi.threads(scope!, { limit: 50 }),
    enabled: !!scope,
  });
}

export function useThreadComments(threadId: string | null, limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.discussions.comments(threadId ?? ""), { limit }],
    queryFn: () => discussionsApi.comments(threadId!, { limit }),
    enabled: !!threadId,
    placeholderData: keepPreviousData,
  });
}

export function useReplies(commentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.discussions.replies(commentId),
    queryFn: () => discussionsApi.replies(commentId, { limit: 50 }),
    enabled,
  });
}

export function useCreateThread(scope: ThreadScope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, content }: { title: string; content: string }) => discussionsApi.createThread(scope, title, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.discussions.threads(scope) }),
  });
}

/** Comment mutations; each refreshes the thread's comments and the thread list. */
export function useCommentActions(threadId: string) {
  const qc = useQueryClient();
  const refresh = (parentId?: string | null) => {
    void qc.invalidateQueries({ queryKey: queryKeys.discussions.comments(threadId) });
    if (parentId) void qc.invalidateQueries({ queryKey: queryKeys.discussions.replies(parentId) });
    void qc.invalidateQueries({ queryKey: [...queryKeys.discussions.all, "threads"] });
  };

  const add = useMutation({
    mutationFn: ({ content, parentId }: { content: string; parentId?: string }) => discussionsApi.addComment(threadId, content, parentId),
    onSuccess: (_c, v) => refresh(v.parentId),
  });
  const edit = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string; parentId?: string | null }) =>
      discussionsApi.editComment(commentId, content),
    onSuccess: (_c, v) => refresh(v.parentId),
  });
  const remove = useMutation({
    mutationFn: ({ commentId }: { commentId: string; parentId?: string | null }) => discussionsApi.deleteComment(commentId),
    onSuccess: (_c, v) => refresh(v.parentId),
  });
  const react = useMutation({
    mutationFn: ({ commentId, type }: { commentId: string; type: ReactionType; parentId?: string | null }) =>
      discussionsApi.react(commentId, type),
    onSuccess: (_c, v) => refresh(v.parentId),
  });
  const report = useMutation({
    mutationFn: ({ commentId, reason, details }: { commentId: string; reason: ReportReason; details?: string }) =>
      discussionsApi.reportComment(commentId, reason, details),
  });

  return { add, edit, remove, react, report };
}
