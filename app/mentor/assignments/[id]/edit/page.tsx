import type { Metadata } from "next";
import EditAssignment from "./EditAssignment";

export const metadata: Metadata = { title: "Edit assignment" };

export default async function EditAssignmentPage({ params }: PageProps<"/mentor/assignments/[id]/edit">) {
  const { id } = await params;
  return <EditAssignment assignmentId={id} />;
}
