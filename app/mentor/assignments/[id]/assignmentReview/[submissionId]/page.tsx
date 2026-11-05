import type { Metadata } from "next";
import GradingView from "./GradingView";

export const metadata: Metadata = { title: "Review submission" };

export default async function SubmissionDetailPage({ params }: PageProps<"/mentor/assignments/[id]/assignmentReview/[submissionId]">) {
  const { id, submissionId } = await params;
  return <GradingView assignmentId={id} submissionId={submissionId} />;
}
