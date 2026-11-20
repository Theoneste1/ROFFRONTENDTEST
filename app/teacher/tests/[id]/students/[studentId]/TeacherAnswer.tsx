"use client";

import AnswerWorkspace from "@/app/components/test-management/AnswerWorkspace";
import { TESTS_SUBMIT_FOR_STUDENTS } from "@/lib/test-management/submissions";

export function TeacherAnswer({ testId, studentId }: { testId: string; studentId: string }) {
  return (
    <AnswerWorkspace target={{ testId, studentId }} backHref={`/teacher/tests/${testId}`} backLabel="Students for this test" permission={TESTS_SUBMIT_FOR_STUDENTS} />
  );
}
