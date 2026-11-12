import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TeacherStudentDetail from "./TeacherStudentDetail";

export const metadata: Metadata = { title: "Student" };

export default async function TeacherStudentPage({ params }: PageProps<"/teacher/students/[id]">) {
  const { id } = await params;
  return (
    <PermissionsGate>
      <TeacherStudentDetail studentId={id} />
    </PermissionsGate>
  );
}
