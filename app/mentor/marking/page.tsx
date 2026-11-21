import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MarkingQueue } from "@/app/components/test-management/MarkingWorkspace";

export const metadata: Metadata = { title: "Marking" };

/** Coaches: the submissions assigned to them for blind marking (capability testMarking, tests.mark). */
export default function MarkingQueuePage() {
  return (
    <PermissionsGate>
      <MarkingQueue />
    </PermissionsGate>
  );
}
