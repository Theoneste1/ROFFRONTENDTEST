import type { ReactNode } from "react";
import AuthShell from "@/app/components/shell/AuthShell";

/** Public pages: sign in, activation, password reset, help and support. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
