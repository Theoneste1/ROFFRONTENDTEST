import type { Metadata } from "next";
import AdminSubmissionReview from "./AdminSubmissionReview";

export const metadata: Metadata = { title: "Submission review" };

/** Also the target of the backend's "review awaiting approval" notification links. */
export default async function AdminSubmissionPage({ params }: PageProps<"/admin/submissions/[id]">) {
  const { id } = await params;
  return <AdminSubmissionReview submissionId={id} />;
}
