import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TestsList from "@/app/components/test-management/TestsList";

export const metadata: Metadata = { title: "Tests" };

/** Administrators: tests of every subject (capability testManagement, tests.view). */
export default function TestsPage() {
  return (
    <PermissionsGate>
      <TestsList base="/admin/tests" />
    </PermissionsGate>
  );
}
