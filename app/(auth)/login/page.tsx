import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <LoginForm />
    </Suspense>
  );
}
