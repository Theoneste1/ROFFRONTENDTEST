"use client";

/** Teacher portal data (lib/api/teacher.ts). Each call is refused by the backend without its permission. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teacherApi, type TeacherStudentFilters } from "@/lib/api/teacher";
import { queryKeys } from "@/lib/query/keys";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { teacherStudentAccessSupported } from "@/lib/accounts/teacher-student-access";

/** The School Access page is offered: the backend has teacherStudentAccess and the caller holds users.manageTeachers. */
export function useSchoolAccessPageAvailable(): boolean {
  const { can } = useSession();
  return teacherStudentAccessSupported(useBackendCapabilities().detection) && can("users.manageTeachers");
}

/** GET /teacher/students/summary — only on backends with teacherStudentAccess. */
export function useTeacherStudentsSummary(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.teacher.summary(), queryFn: () => teacherApi.summary(), enabled });
}

export function useTeacherStudents(filters: TeacherStudentFilters) {
  return useQuery({
    queryKey: queryKeys.teacher.students(filters),
    queryFn: () => teacherApi.students(filters),
    placeholderData: keepPreviousData,
  });
}

/** students.viewProfile — only requested when the teacher holds it. */
export function useTeacherStudentProfile(studentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.teacher.profile(studentId),
    queryFn: () => teacherApi.profile(studentId),
    enabled,
  });
}

/** students.viewProgress — only requested when the teacher holds it. */
export function useTeacherStudentProgress(studentId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.teacher.progress(studentId),
    queryFn: () => teacherApi.progress(studentId),
    enabled,
  });
}

/** submissions.submitOnBehalf. The student's progress is reloaded afterwards (new attempt, submitter). */
export function useSubmitOnBehalf(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof teacherApi.submitOnBehalf>[1]) => teacherApi.submitOnBehalf(studentId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.teacher.progress(studentId) }),
  });
}
