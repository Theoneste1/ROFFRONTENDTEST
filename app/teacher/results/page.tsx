import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { SchoolResultTests } from "@/app/components/test-management/ResultViews";

export const metadata: Metadata = { title: "Results" };

/** Teachers: tests with published results of their schools' students (capability testResults, tests.viewSchoolResults). */
export default function TeacherResultsPage() {
  return (
    <PermissionsGate>
      <SchoolResultTests />
    </PermissionsGate>
  );
}
