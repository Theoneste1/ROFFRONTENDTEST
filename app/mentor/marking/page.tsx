import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MarkingQueue } from "@/app/components/test-management/MarkingWorkspace";
import { QuestionQueueSection } from "@/app/components/test-management/QuestionMarkingCoach";

export const metadata: Metadata = { title: "Marking" };

/**
 * Coaches: blind marking (capability testMarking, tests.mark) — the questions to mark one at a time on tests marked by
 * question (capability questionMarking; shown only when there are any), then the papers assigned to them.
 */
export default function MarkingQueuePage() {
  return (
    <PermissionsGate>
      <MarkingQueue before={<QuestionQueueSection />} />
    </PermissionsGate>
  );
}
