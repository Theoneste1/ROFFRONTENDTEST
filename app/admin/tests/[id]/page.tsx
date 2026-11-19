import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TestDetail from "@/app/components/test-management/TestDetail";

export const metadata: Metadata = { title: "Test" };

/** Administrators: tests of every subject: one test (details, questions, files, markers). */
export default async function TestPage({ params }: PageProps<"/admin/tests/[id]">) {
  const { id } = await params;
  return (
    <PermissionsGate>
      <TestDetail id={id} base="/admin/tests" />
    </PermissionsGate>
  );
}
