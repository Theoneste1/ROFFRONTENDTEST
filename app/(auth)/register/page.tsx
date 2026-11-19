import type { Metadata } from "next";
import { SignupCard } from "@/app/components/auth/AuthCard";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = { title: "Join as a student" };

/** Student self-registration (existing backend flow: POST /auth/register/student). */
export default function RegisterPage() {
  return (
    <SignupCard brand="student">
      <div data-signup className="contents">
        <RegisterForm />
      </div>
    </SignupCard>
  );
}
