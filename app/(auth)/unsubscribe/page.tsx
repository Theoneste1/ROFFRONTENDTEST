import type { Metadata } from "next";
import { Suspense } from "react";
import UnsubscribeForm from "./UnsubscribeForm";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

/** Target of the link in every ROF news e-mail: APP_URL + /unsubscribe?s=<subscriber>&t=<token>. */
export default function UnsubscribePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <UnsubscribeForm />
    </Suspense>
  );
}
