import type { Metadata } from "next";
import AdminAssignmentDetail from "./AdminAssignmentDetail";

export const metadata: Metadata = { title: "Assignment" };

export default async function AdminAssignmentPage({ params }: PageProps<"/admin/assignments/[id]">) {
  const { id } = await params;
  return <AdminAssignmentDetail assignmentId={id} />;
}
