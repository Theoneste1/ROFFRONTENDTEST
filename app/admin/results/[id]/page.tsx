import type { Metadata } from "next";
import AssignmentResults from "./AssignmentResults";

export const metadata: Metadata = { title: "Assignment results" };

export default async function AssignmentResultsPage({ params }: PageProps<"/admin/results/[id]">) {
  const { id } = await params;
  return <AssignmentResults assignmentId={id} />;
}
