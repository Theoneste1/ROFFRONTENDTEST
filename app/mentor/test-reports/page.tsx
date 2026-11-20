import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { TestReports } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Test reports" };

/** Head Coaches: the published tests of the subjects they head, with counts, averages and publications (tests.viewResults). */
export default function MentorTestReportsPage() {
  return (
    <PermissionsGate>
      <TestReports portal="mentor" />
    </PermissionsGate>
  );
}
