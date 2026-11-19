import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { MyTestAnswer } from "./MyTestAnswer";

export const metadata: Metadata = { title: "Test" };

/** Students: one test — the paper and questions once open, my deadline, submit / replace, my versions. */
export default async function MyTestPage({ params }: PageProps<"/student/tests/[id]">) {
  const { id } = await params;
  return (
    <PermissionsGate>
      <MyTestAnswer testId={id} />
    </PermissionsGate>
  );
}
