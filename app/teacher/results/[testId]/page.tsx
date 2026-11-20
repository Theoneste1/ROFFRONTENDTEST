import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { SchoolResults } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Results" };

/** Teachers: one test's published results of their schools' students, by name — never ranked. */
export default async function TeacherTestResultsPage({ params }: PageProps<"/teacher/results/[testId]">) {
  const { testId } = await params;
  return (
    <PermissionsGate>
      <SchoolResults testId={testId} />
    </PermissionsGate>
  );
}
