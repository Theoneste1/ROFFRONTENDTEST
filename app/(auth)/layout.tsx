import type { ReactNode } from "react";
import PublicCard from "@/app/components/shell/PublicCard";

/** Public pages: sign in, activation, password reset, help and support. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PublicCard>{children}</PublicCard>;
}
