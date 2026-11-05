import type { Metadata } from "next";
import AssignmentOverview from "./AssignmentOverview";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentDetailPage({ params }: PageProps<"/mentor/assignments/[id]">) {
  const { id } = await params;
  return <AssignmentOverview assignmentId={id} />;
}
