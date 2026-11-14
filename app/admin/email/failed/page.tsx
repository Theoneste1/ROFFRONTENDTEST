import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import FailedDeliveriesClient from "./FailedDeliveriesClient";

export const metadata: Metadata = { title: "Failed e-mails" };

export default function FailedDeliveriesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <FailedDeliveriesClient />
    </Suspense>
  );
}
