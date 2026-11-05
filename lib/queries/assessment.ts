"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignmentsApi,
  resultsApi,
  submissionsApi,
  type MyAssignmentFilters,
  type MyResultFilters,
  type NewSubmission,
} from "@/lib/api/assessment";
import { queryKeys } from "@/lib/query/keys";

export function useMyAssignments(filters: MyAssignmentFilters = {}) {
  return useQuery({
    queryKey: queryKeys.assignments.mine(filters),
    queryFn: () => assignmentsApi.mine(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAssignment(assignmentId: string) {
  return useQuery({
    queryKey: queryKeys.assignments.detail(assignmentId),
    queryFn: () => assignmentsApi.get(assignmentId),
    enabled: !!assignmentId,
  });
}

export function useSubmission(submissionId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.submissions.detail(submissionId ?? ""),
    queryFn: () => submissionsApi.get(submissionId!),
    enabled: !!submissionId,
  });
}

export function useSubmissionHistory(submissionId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.submissions.history(submissionId ?? ""),
    queryFn: () => submissionsApi.history(submissionId!),
    enabled: !!submissionId,
  });
}

/**
 * Submit or resubmit. Afterwards the assignment (status, canSubmit), the
 * lists and the submission itself are refetched from the backend.
 */
export function useSubmitAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSubmission) => submissionsApi.submit(input),
    onSuccess: (submission) => {
      qc.setQueryData(queryKeys.submissions.detail(submission.id), submission);
      void qc.invalidateQueries({ queryKey: queryKeys.assignments.all });
      void qc.invalidateQueries({ queryKey: queryKeys.submissions.all });
      void qc.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMyResults(filters: MyResultFilters = {}) {
  return useQuery({
    queryKey: queryKeys.results.mine(filters),
    queryFn: () => resultsApi.mine(filters),
    placeholderData: keepPreviousData,
  });
}

export function useResult(submissionId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.results.detail(submissionId ?? ""),
    queryFn: () => resultsApi.get(submissionId!),
    enabled: !!submissionId && enabled,
  });
}
