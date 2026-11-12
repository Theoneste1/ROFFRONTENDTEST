import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TeacherStudents from "./TeacherStudents";

export const metadata: Metadata = { title: "My students" };

/** Teacher portal home: the students of the teacher's assigned schools (`GET /teacher/students`). */
export default function TeacherDashboardPage() {
  return (
    <PermissionsGate>
      <TeacherStudents />
    </PermissionsGate>
  );
}
