"use client";

/**
 * TanStack Query hooks for the mentor portal. Every mutation invalidates the
 * cached data it changes, so lists, details and counts refresh from the API.
 */
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  mentorAssignmentsApi,
  mentorResourcesApi,
  reviewsApi,
  teachingApi,
  type AssignmentFilters,
  type AssignmentInput,
  type ResourceInput,
  type ReviewFilters,
} from "@/lib/api/mentor";
import { leaderboardApi } from "@/lib/api/community";
import { queryKeys } from "@/lib/query/keys";
import type { TeachingScope } from "@/lib/api/types";

// ─── Scopes & analytics ─────────────────────────────────────────────────────

/** The course × division pairs this mentor teaches (`GET /me/teaching`). */
export function useTeachingScopes() {
  return useQuery({
    queryKey: queryKeys.mentor.scopes(),
    queryFn: async () =>
      (await teachingApi.scopes()).slice().sort((a, b) => a.division.code.localeCompare(b.division.code) || a.course.title.localeCompare(b.course.title)),
    staleTime: 5 * 60_000,
  });
}

export function scopeKey(s: { course: { id: string }; division: { id: string } }) {
  return `${s.course.id}:${s.division.id}`;
}

export function scopeLabel(s: TeachingScope) {
  return `${s.course.title} · ${s.division.name}`;
}

export function useCourseAnalytics(courseId: string | undefined, divisionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.analytics(courseId ?? "", divisionId ?? ""),
    queryFn: () => teachingApi.analytics(courseId!, divisionId!),
    enabled: !!courseId && !!divisionId,
  });
}

/** Analytics for several scopes at once (dashboard totals). */
export function useScopesAnalytics(scopes: TeachingScope[] | undefined) {
  return useQueries({
    queries: (scopes ?? []).map((s) => ({
      queryKey: queryKeys.mentor.analytics(s.course.id, s.division.id),
      queryFn: () => teachingApi.analytics(s.course.id, s.division.id),
    })),
  });
}

/** Top of a division's leaderboard (mentors may read it). */
export function useDivisionTop(divisionId: string | undefined, limit = 5) {
  return useQuery({
    queryKey: [...queryKeys.leaderboard.students({ page: 1, limit }), divisionId],
    queryFn: () => leaderboardApi.students({ page: 1, limit, divisionId }),
    enabled: !!divisionId,
  });
}

// ─── Assignments ────────────────────────────────────────────────────────────

export function useMentorAssignments(filters: AssignmentFilters = {}) {
  return useQuery({
    queryKey: queryKeys.mentor.assignments(filters),
    queryFn: () => mentorAssignmentsApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useMentorAssignment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.assignment(id ?? ""),
    queryFn: () => mentorAssignmentsApi.get(id!),
    enabled: !!id,
  });
}

export function useAssignmentHistory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.assignmentHistory(id ?? ""),
    queryFn: () => mentorAssignmentsApi.history(id!),
    enabled: !!id,
  });
}

function useInvalidateAssignments() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: queryKeys.mentor.assignmentsAll });
    if (id) {
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.assignment(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.assignmentHistory(id) });
    }
  };
}

export function useCreateAssignment() {
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: ({ input, files, submit }: { input: AssignmentInput; files: File[]; submit: boolean }) =>
      mentorAssignmentsApi.create(input, files).then((a) => (submit ? mentorAssignmentsApi.submitForApproval(a.id) : a)),
    onSuccess: (a) => invalidate(a.id),
  });
}

export function useUpdateAssignment(id: string) {
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: async ({
      input,
      addFiles,
      removeAttachmentIds,
      submit,
    }: {
      input: Partial<Omit<AssignmentInput, "courseId" | "divisionId">>;
      addFiles: File[];
      removeAttachmentIds: string[];
      submit: boolean;
    }) => {
      let a = await mentorAssignmentsApi.update(id, input);
      for (const att of removeAttachmentIds) await mentorAssignmentsApi.removeAttachment(id, att);
      if (addFiles.length) a = await mentorAssignmentsApi.addAttachments(id, addFiles);
      if (submit) a = await mentorAssignmentsApi.submitForApproval(id);
      return a;
    },
    onSettled: () => invalidate(id),
  });
}

export function useAssignmentTransition(id: string) {
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: (action: "submit" | "recall") =>
      action === "submit" ? mentorAssignmentsApi.submitForApproval(id) : mentorAssignmentsApi.recall(id),
    onSuccess: () => invalidate(id),
  });
}

// ─── Reviews ────────────────────────────────────────────────────────────────

export function useReviewQueue(filters: ReviewFilters = {}) {
  return useQuery({
    queryKey: queryKeys.mentor.reviews(filters),
    queryFn: () => reviewsApi.queue(filters),
    placeholderData: keepPreviousData,
  });
}

export function useReviewSubmission(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.review(id ?? ""),
    queryFn: () => reviewsApi.submission(id!),
    enabled: !!id,
  });
}

export function useReviewCycles(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.reviewCycles(id ?? ""),
    queryFn: () => reviewsApi.cycles(id!),
    enabled: !!id,
  });
}

type ReviewAction =
  | { type: "start" }
  | { type: "mark"; score: number; feedback: string; files: File[] }
  | { type: "submitToAdmin" }
  | { type: "markAndSubmit"; score: number; feedback: string; files: File[] }
  | { type: "requestResubmission"; note: string; dueAt?: string }
  | { type: "withdrawResubmission" }
  | { type: "removeFeedbackFile"; attachmentId: string };

/** Every review step for one submission; refreshes the submission, its cycles and the queue. */
export function useReviewAction(submissionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: ReviewAction) => {
      switch (action.type) {
        case "start":
          return reviewsApi.start(submissionId);
        case "mark":
          return reviewsApi.mark(submissionId, action.score, action.feedback, action.files);
        case "submitToAdmin":
          return reviewsApi.submitToAdmin(submissionId);
        case "markAndSubmit":
          await reviewsApi.mark(submissionId, action.score, action.feedback, action.files);
          return reviewsApi.submitToAdmin(submissionId);
        case "requestResubmission":
          return reviewsApi.requestResubmission(submissionId, action.note, action.dueAt);
        case "withdrawResubmission":
          return reviewsApi.withdrawResubmission(submissionId);
        case "removeFeedbackFile":
          await reviewsApi.removeFeedbackFile(submissionId, action.attachmentId);
          return null;
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.review(submissionId) });
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.reviewCycles(submissionId) });
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.reviewsAll });
      void qc.invalidateQueries({ queryKey: queryKeys.mentor.analyticsAll });
    },
  });
}

// ─── Resources ──────────────────────────────────────────────────────────────

export function useMentorResources(courseId: string | undefined, divisionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.resources(courseId ?? "", divisionId ?? ""),
    queryFn: () => mentorResourcesApi.list(courseId!, divisionId!),
    enabled: !!courseId && !!divisionId,
  });
}

export function useMentorResource(courseId: string | undefined, resourceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.mentor.resource(courseId ?? "", resourceId ?? ""),
    queryFn: () => mentorResourcesApi.get(courseId!, resourceId!),
    enabled: !!courseId && !!resourceId,
  });
}

function useInvalidateResources() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.mentor.resourcesAll });
    void qc.invalidateQueries({ queryKey: queryKeys.mentor.analyticsAll });
    // Student-side caches in the same browser (shared course pages).
    void qc.invalidateQueries({ queryKey: queryKeys.courses.all });
  };
}

export function useResourceAction(courseId: string) {
  const invalidate = useInvalidateResources();
  return useMutation({
    mutationFn: ({ resourceId, action }: { resourceId: string; action: "publish" | "unpublish" | "archive" | "restore" | "delete" }) =>
      action === "delete" ? mentorResourcesApi.remove(courseId, resourceId) : mentorResourcesApi.setState(courseId, resourceId, action),
    onSuccess: invalidate,
  });
}

export function useSaveResource(courseId: string) {
  const invalidate = useInvalidateResources();
  return useMutation({
    mutationFn: async (args: {
      resourceId?: string;
      input: ResourceInput;
      addFiles: File[];
      removeAttachmentIds: string[];
      publish: boolean;
    }) => {
      let res;
      if (args.resourceId) {
        const { divisionId: _ignored, ...changes } = args.input;
        void _ignored;
        res = await mentorResourcesApi.update(courseId, args.resourceId, changes);
        for (const att of args.removeAttachmentIds) await mentorResourcesApi.removeAttachment(courseId, args.resourceId, att);
        if (args.addFiles.length) res = await mentorResourcesApi.addAttachments(courseId, args.resourceId, args.addFiles);
      } else {
        res = await mentorResourcesApi.create(courseId, args.input, args.addFiles);
      }
      if (args.publish && !res.isPublished) res = await mentorResourcesApi.setState(courseId, res.id, "publish");
      return res;
    },
    onSettled: invalidate,
  });
}
