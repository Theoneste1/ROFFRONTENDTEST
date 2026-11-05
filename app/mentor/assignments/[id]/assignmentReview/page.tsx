import type { Metadata } from "next";
import ReviewList from "./ReviewList";

export const metadata: Metadata = { title: "Submissions" };

export default async function AssignmentReviewPage({ params }: PageProps<"/mentor/assignments/[id]/assignmentReview">) {
  const { id } = await params;
  return <ReviewList assignmentId={id} />;
}
