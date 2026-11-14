import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import ActivityClient from "./ActivityClient";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ActivityClient />
    </Suspense>
  );
}
