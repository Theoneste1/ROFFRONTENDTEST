import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { TeacherTestStudents } from "@/app/components/test-management/AnswerLists";

export const metadata: Metadata = { title: "Students for a test" };

/** Teachers: their verified students for one test — deadline, state, submission. */
export default async function TeacherTestPage({ params }: PageProps<"/teacher/tests/[id]">) {
  const { id } = await params;
  return (
    <PermissionsGate>
      <TeacherTestStudents testId={id} />
    </PermissionsGate>
  );
}
