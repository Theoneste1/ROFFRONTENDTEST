import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TestCreate from "@/app/components/test-management/TestCreate";

export const metadata: Metadata = { title: "New test" };

/** Head Coaches: tests of the subjects they head (coach portal): create a test (tests.manage). */
export default function NewTestPage() {
  return (
    <PermissionsGate>
      <TestCreate base="/mentor/tests" />
    </PermissionsGate>
  );
}
