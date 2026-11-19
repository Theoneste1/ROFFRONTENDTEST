import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { LoadingBlock } from "@/app/components/ui/feedback";
import { LoginCard } from "@/app/components/auth/AuthCard";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <LoginCard>
      <Suspense fallback={<LoadingBlock />}>
        <LoginForm />
      </Suspense>
    </LoginCard>
  );
}
