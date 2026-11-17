import type { Metadata } from "next";
import SchoolAccess from "./SchoolAccess";

export const metadata: Metadata = { title: "Teacher & student access" };

export default async function AdminSchoolAccessPage({ params }: PageProps<"/admin/schools/[id]/access">) {
  const { id } = await params;
  return <SchoolAccess schoolId={id} />;
}
