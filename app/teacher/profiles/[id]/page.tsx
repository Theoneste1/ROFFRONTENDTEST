import type { Metadata } from "next";
import StudentProfilePage from "@/app/components/students/StudentProfilePage";

export const metadata: Metadata = { title: "Student profile" };

/** A student's profile (Student Profile Overview, owner 2026-11-22). */
export default async function Page({ params }: PageProps<"/teacher/profiles/[id]">) {
  const { id } = await params;
  return <StudentProfilePage studentId={id} />;
}
