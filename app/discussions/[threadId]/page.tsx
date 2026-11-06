import type { Metadata } from "next";
import { Suspense } from "react";
import DeepLinkRedirect from "@/app/components/notifications/DeepLinkRedirect";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Opening…" };

/** Role-neutral notification link: redirects to the signed-in role's own page. */
export default function DeepLinkPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <DeepLinkRedirect />
    </Suspense>
  );
}
