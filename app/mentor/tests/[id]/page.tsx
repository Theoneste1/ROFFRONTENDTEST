import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TestDetail from "@/app/components/test-management/TestDetail";

export const metadata: Metadata = { title: "Test" };

/** Head Coaches: tests of the subjects they head (coach portal): one test (details, questions, files, markers). */
export default async function TestPage({ params, searchParams }: PageProps<"/mentor/tests/[id]">) {
  const { id } = await params;
  const tab = (await searchParams).tab;
  return (
    <PermissionsGate>
      <TestDetail id={id} base="/mentor/tests" initialTab={typeof tab === "string" ? tab : undefined} />
    </PermissionsGate>
  );
}
