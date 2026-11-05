import type { Metadata } from "next";
import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Reset password" };

/** Target of the e-mailed link: APP_URL + /reset-password?token=… */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
