import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { SchoolResults } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Results" };

/** Coaches: one test's published results, every student of their programmes, by name — never ranked. */
export default async function CoachTestResultsPage({ params }: PageProps<"/mentor/results/[testId]">) {
  const { testId } = await params;
  return (
    <PermissionsGate>
      <SchoolResults testId={testId} audience="coach" />
    </PermissionsGate>
  );
}
