import type { Metadata } from "next";
import { Suspense } from "react";
import ApplyForm from "./ApplyForm";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Join as a coach" };

/** Coach application (existing backend flow: POST /mentor-requests). */
export default function ApplyPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ApplyForm />
    </Suspense>
  );
}
