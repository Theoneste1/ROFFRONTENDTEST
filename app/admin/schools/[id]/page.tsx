import type { Metadata } from "next";
import SchoolDetail from "./SchoolDetail";

export const metadata: Metadata = { title: "School" };

export default async function AdminSchoolPage({ params }: PageProps<"/admin/schools/[id]">) {
  const { id } = await params;
  return <SchoolDetail schoolId={id} />;
}
