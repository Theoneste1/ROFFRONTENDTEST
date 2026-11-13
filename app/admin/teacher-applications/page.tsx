import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import TeacherApplicationsReview from "./TeacherApplicationsReview";

export const metadata: Metadata = { title: "Teacher applications" };

/** Administrators: teacher self-registration applications (`/admin/teacher-applications`, users.manageTeachers). */
export default function TeacherApplicationsPage() {
  return (
    <PermissionsGate>
      <TeacherApplicationsReview />
    </PermissionsGate>
  );
}
