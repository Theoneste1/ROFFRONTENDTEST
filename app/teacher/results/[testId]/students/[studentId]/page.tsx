import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { SchoolResult } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Result" };

/** Teachers: one student's published result (marks per question, total, comments). */
export default async function TeacherStudentResultPage({ params }: PageProps<"/teacher/results/[testId]/students/[studentId]">) {
  const { testId, studentId } = await params;
  return (
    <PermissionsGate>
      <SchoolResult testId={testId} studentId={studentId} />
    </PermissionsGate>
  );
}
