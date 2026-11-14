"use client";

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { coursesApi, type ResourceFilters } from "@/lib/api/learning";
import { queryKeys } from "@/lib/query/keys";
import { mathematicsCourses } from "@/lib/learning/library";

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

/**
 * The student's Mathematics resource library: the Mathematics courses (`GET /courses`)
 * and each one's resources (`GET /courses/:id/resources`, no filters — the same cache
 * entries as the course pages). The backend returns only the student's own division,
 * published resources; filtering happens on the client (lib/learning/library.ts).
 * `enabled`: false until the caller knows the student may see resources (resources.view).
 */
export function useMathLibrary(enabled = true) {
  const courses = useQuery({
    queryKey: queryKeys.courses.list(),
    queryFn: async () => (await coursesApi.list()).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    staleTime: 5 * 60_000,
    enabled,
  });
  const maths = mathematicsCourses(courses.data ?? []);
  const sections = useQueries({
    queries: maths.map((c) => ({
      queryKey: queryKeys.courses.resources(c.id, {}),
      queryFn: () => coursesApi.resources(c.id, {}),
      enabled,
    })),
  });
  return {
    courses,
    sections: maths.map((course, i) => ({ course, query: sections[i] })),
    resources: sections.flatMap((q) => q.data ?? []),
    loading: courses.isPending || sections.some((q) => q.isPending),
  };
}
