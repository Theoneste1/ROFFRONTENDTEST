import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MarkingWorkspace } from "@/app/components/test-management/MarkingWorkspace";

export const metadata: Metadata = { title: "Marking" };

/** Coaches: one assigned submission, by its code only (blind): page viewer, marking guide, marks (tests.mark). */
export default async function MarkingPage({ params }: PageProps<"/mentor/marking/[code]">) {
  const { code } = await params;
  return (
    <PermissionsGate>
      <MarkingWorkspace code={decodeURIComponent(code)} />
    </PermissionsGate>
  );
}
