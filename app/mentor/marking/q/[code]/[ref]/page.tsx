import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { QuestionWorkspace } from "@/app/components/test-management/QuestionMarkingCoach";

export const metadata: Metadata = { title: "Marking" };

/** Coaches: one question of one paper (question-level marking; blind: the paper code and question only). */
export default async function QuestionMarkingPage({ params }: { params: Promise<{ code: string; ref: string }> }) {
  const { code, ref } = await params;
  return (
    <PermissionsGate>
      <QuestionWorkspace code={decodeURIComponent(code)} refName={decodeURIComponent(ref)} />
    </PermissionsGate>
  );
}
