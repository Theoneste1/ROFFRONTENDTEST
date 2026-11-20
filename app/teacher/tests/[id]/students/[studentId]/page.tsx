import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { TeacherAnswer } from "./TeacherAnswer";

export const metadata: Metadata = { title: "Answer for a student" };

/** Teachers: submit or replace one student's answer, with the same screen as the student's. */
export default async function TeacherAnswerPage({ params }: PageProps<"/teacher/tests/[id]/students/[studentId]">) {
  const { id, studentId } = await params;
  return (
    <PermissionsGate>
      <TeacherAnswer testId={id} studentId={studentId} />
    </PermissionsGate>
  );
}
