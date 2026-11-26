import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { ResultsGate } from "@/app/components/test-management/ResultViews";
import MarkingOverview from "@/app/components/marking/MarkingOverview";

export const metadata: Metadata = { title: "Marking overview" };

/** Head Coaches: the marking of the subjects they head (GET /admin/test-dashboard; capability testResults, tests.view). */
export default function MentorMarkingOverviewPage() {
  return (
    <PermissionsGate>
      <ResultsGate title="Marking overview" permission="tests.view" forbidden="The marking overview is for Head Coaches and Administrators. Your marking queue is under Marking.">
        <MarkingOverview audience="headCoach" />
      </ResultsGate>
    </PermissionsGate>
  );
}
