import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { TestReports } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Test reports" };

/** Administrators: every subject's published tests with counts, averages and publications (tests.viewResults). */
export default function AdminTestReportsPage() {
  return (
    <PermissionsGate>
      <TestReports portal="admin" />
    </PermissionsGate>
  );
}
