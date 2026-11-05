import type { Metadata } from "next";
import { Suspense } from "react";
import ActivateAccount from "./ActivateAccount";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Activate account" };

/** Target of invitation and e-mail-confirmation links: APP_URL + /activate?token=… */
export default function ActivatePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ActivateAccount />
    </Suspense>
  );
}
