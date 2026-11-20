import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TestCreate from "@/app/components/test-management/TestCreate";

export const metadata: Metadata = { title: "New test" };

/** Administrators: tests of every subject: create a test (tests.manage). */
export default function NewTestPage() {
  return (
    <PermissionsGate>
      <TestCreate base="/admin/tests" />
    </PermissionsGate>
  );
}
