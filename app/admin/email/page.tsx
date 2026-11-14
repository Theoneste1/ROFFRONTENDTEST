import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import EmailJobsClient from "./EmailJobsClient";

export const metadata: Metadata = { title: "E-mail" };

export default function EmailJobsPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EmailJobsClient />
    </Suspense>
  );
}
