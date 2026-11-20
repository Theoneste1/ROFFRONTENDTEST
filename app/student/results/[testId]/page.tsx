import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MyResult } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "My result" };

/** Students: one published result — marks per question, total, comments (the link of the "Results published" notice). */
export default async function MyResultPage({ params }: PageProps<"/student/results/[testId]">) {
  const { testId } = await params;
  return (
    <PermissionsGate>
      <MyResult testId={testId} />
    </PermissionsGate>
  );
}
