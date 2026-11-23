import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { SchoolResultTests } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Results" };

/** Coaches: tests of their programmes with published results (capability coachProgrammeAccess, tests.viewProgrammeResults). */
export default function CoachResultsPage() {
  return (
    <PermissionsGate>
      <SchoolResultTests audience="coach" />
    </PermissionsGate>
  );
}
