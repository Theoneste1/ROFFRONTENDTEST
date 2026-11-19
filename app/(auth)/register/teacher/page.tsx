import type { Metadata } from "next";
import { SignupCard } from "@/app/components/auth/AuthCard";
import TeacherRegisterForm from "./TeacherRegisterForm";

export const metadata: Metadata = { title: "Join as a teacher" };

/**
 * Teacher self-registration (POST /auth/register/teacher): an application an Administrator
 * reviews. Shown only on a backend advertising `teacherSelfRegistration` while registration is open.
 */
export default function TeacherRegisterPage() {
  return (
    <SignupCard brand="teacher">
      <div data-signup className="contents">
        <TeacherRegisterForm />
      </div>
    </SignupCard>
  );
}
