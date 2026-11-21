"use client";

import AnswerWorkspace from "@/app/components/test-management/AnswerWorkspace";
import { TESTS_SUBMIT } from "@/lib/test-management/submissions";

export function MyTestAnswer({ testId }: { testId: string }) {
  return <AnswerWorkspace target={{ testId, studentId: null }} backHref="/student/tests" backLabel="My tests" permission={TESTS_SUBMIT} />;
}
