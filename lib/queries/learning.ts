"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coursesApi, type ResourceFilters } from "@/lib/api/learning";
import { queryKeys } from "@/lib/query/keys";

/** The four courses, ordered as the backend orders them. */
export function useCourses() {
  return useQuery({
    queryKey: queryKeys.courses.list(),
    queryFn: async () => (await coursesApi.list()).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    staleTime: 5 * 60_000,
  });
}

export function useMyCourses() {
  return useQuery({ queryKey: queryKeys.courses.mine(), queryFn: coursesApi.mine });
}

export function useCourse(courseId: string) {
  return useQuery({ queryKey: queryKeys.courses.detail(courseId), queryFn: () => coursesApi.get(courseId), enabled: !!courseId });
}

export function useCourseResources(courseId: string, filters: ResourceFilters = {}) {
  return useQuery({
    queryKey: queryKeys.courses.resources(courseId, filters),
    queryFn: () => coursesApi.resources(courseId, filters),
    enabled: !!courseId,
    placeholderData: keepPreviousData,
  });
}

export function useCompleteCourse(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => coursesApi.complete(courseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.courses.all }),
  });
}
