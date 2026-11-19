import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { TeacherTests } from "@/app/components/test-management/AnswerLists";

export const metadata: Metadata = { title: "Tests" };

/** Teachers (G2): published tests and how many of their verified students have submitted (tests.submitForStudents). */
export default function TeacherTestsPage() {
  return (
    <PermissionsGate>
      <TeacherTests />
    </PermissionsGate>
  );
}
