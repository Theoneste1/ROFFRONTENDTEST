import ReviewRedirect from "./ReviewRedirect";

/** `/mentor/reviews/:submissionId` (backend notification link) → the grading page. */
export default async function ReviewLinkPage({ params }: PageProps<"/mentor/reviews/[submissionId]">) {
  const { submissionId } = await params;
  return <ReviewRedirect submissionId={submissionId} />;
}
