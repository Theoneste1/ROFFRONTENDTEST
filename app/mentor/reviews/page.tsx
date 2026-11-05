import type { Metadata } from "next";
import { Suspense } from "react";
import ReviewQueue from "./ReviewQueue";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Reviews" };

/** The mentor's review queue across all assignments (`GET /mentor/reviews`). */
export default function ReviewsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ReviewQueue />
    </Suspense>
  );
}
