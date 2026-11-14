import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import AcademicYearsClient from "./AcademicYearsClient";

export const metadata: Metadata = { title: "Academic years" };

/** Administrators: plan, edit and start academic years (academicYears.manage). */
export default function AcademicYearsPage() {
  return (
    <PermissionsGate>
      <AcademicYearsClient />
    </PermissionsGate>
  );
}
