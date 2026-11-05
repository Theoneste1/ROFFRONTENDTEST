"use client";

import { useMemo } from "react";
import type { TeachingScope } from "@/lib/api/types";
import { useAdminDivisions } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";

/**
 * Every course × division as a scope, in the shape the mentor resource
 * components expect (administrators manage resources in every scope).
 */
export function useAdminScopes() {
  const courses = useCourses();
  const divisions = useAdminDivisions();
  const data = useMemo<TeachingScope[] | undefined>(() => {
    if (!courses.data || !divisions.data) return undefined;
    return divisions.data.flatMap((d) =>
      courses.data.map((c) => ({
        id: `${c.id}:${d.id}`,
        course: { id: c.id, code: c.code, title: c.title },
        division: { id: d.id, code: d.code, name: d.name },
        createdAt: "",
      })),
    );
  }, [courses.data, divisions.data]);
  return {
    data,
    isPending: courses.isPending || divisions.isPending,
    isError: courses.isError || divisions.isError,
    error: courses.error ?? divisions.error,
    refetch: () => {
      void courses.refetch();
      void divisions.refetch();
    },
  };
}
