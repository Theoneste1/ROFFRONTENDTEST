import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import RespondForm from "./RespondForm";

export const metadata: Metadata = { title: "Answer a question about your application" };

/** Target of the "more information needed" e-mail: APP_URL + /applications/respond?token=… */
export default function RespondPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <RespondForm />
    </Suspense>
  );
}
