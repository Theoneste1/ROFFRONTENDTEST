import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TestsList from "@/app/components/test-management/TestsList";

export const metadata: Metadata = { title: "Tests" };

/** Head Coaches: tests of the subjects they head (coach portal) (capability testManagement, tests.view). */
export default function TestsPage() {
  return (
    <PermissionsGate>
      <TestsList base="/mentor/tests" headCoach />
    </PermissionsGate>
  );
}
