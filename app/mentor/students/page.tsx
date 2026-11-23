import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import CoachStudents from "@/app/components/coaches/CoachStudents";

export const metadata: Metadata = { title: "Students" };

/** Coaches: every student of their programmes, every level (capability coachProgrammeAccess, students.viewProgramme). */
export default function CoachStudentsPage() {
  return (
    <PermissionsGate>
      <CoachStudents />
    </PermissionsGate>
  );
}
