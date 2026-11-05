"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReviewSubmission } from "@/lib/queries/mentor";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { isApiError } from "@/lib/api/errors";

export default function ReviewRedirect({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const sub = useReviewSubmission(submissionId);

  useEffect(() => {
    if (sub.data) router.replace(`/mentor/assignments/${sub.data.assignment.id}/assignmentReview/${sub.data.id}`);
  }, [sub.data, router]);

  if (sub.isError) {
    const notFound = isApiError(sub.error) && [400, 403, 404].includes(sub.error.status);
    return (
      <div className="p-8">
        {notFound ? (
          <div className="bg-white rounded-2xl border border-slate-200">
            <EmptyState
              title="Submission not available"
              description="It doesn't exist or isn't assigned to you."
              action={
                <Link href="/mentor/reviews" className="text-sm font-semibold text-indigo-700 hover:underline">
                  Go to your reviews
                </Link>
              }
            />
          </div>
        ) : (
          <ErrorState error={sub.error} onRetry={() => sub.refetch()} />
        )}
      </div>
    );
  }
  return <LoadingBlock label="Opening the submission…" />;
}
