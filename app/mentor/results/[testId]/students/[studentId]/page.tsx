import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { SchoolResult } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Result" };

/** Coaches: one student's published result (marks per question, total, comments). */
export default async function CoachStudentResultPage({ params }: PageProps<"/mentor/results/[testId]/students/[studentId]">) {
  const { testId, studentId } = await params;
  return (
    <PermissionsGate>
      <SchoolResult testId={testId} studentId={studentId} audience="coach" />
    </PermissionsGate>
  );
}
