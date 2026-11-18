import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import SchoolAccess from "./SchoolAccess";

export const metadata: Metadata = { title: "Teacher & student access" };

export default async function AdminSchoolAccessPage({ params }: PageProps<"/admin/schools/[id]/access">) {
  const { id } = await params;
  return (
    <PermissionsGate>
      <SchoolAccess schoolId={id} />
    </PermissionsGate>
  );
}
