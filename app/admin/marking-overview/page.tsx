import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { ResultsGate } from "@/app/components/test-management/ResultViews";
import MarkingOverview from "@/app/components/marking/MarkingOverview";

export const metadata: Metadata = { title: "Marking overview" };

/** Administrators: the marking of every subject (GET /admin/test-dashboard; capability testResults, tests.view). */
export default function AdminMarkingOverviewPage() {
  return (
    <PermissionsGate>
      <ResultsGate title="Marking overview" permission="tests.view" forbidden="The marking overview is for Head Coaches and Administrators. Your marking queue is under Marking.">
        <MarkingOverview audience="admin" />
      </ResultsGate>
    </PermissionsGate>
  );
}
