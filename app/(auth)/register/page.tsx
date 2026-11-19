import type { Metadata } from "next";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = { title: "Join as a student" };

/** Student self-registration (existing backend flow: POST /auth/register/student). */
export default function RegisterPage() {
  return (
    <div data-signup className="contents">
      <RegisterForm />
    </div>
  );
}
