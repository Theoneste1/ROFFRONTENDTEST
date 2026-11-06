"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { portalHome } from "@/lib/auth/roles";
import type { Role } from "@/lib/api/types";
import { ErrorState, FullPageLoader } from "@/app/components/ui/feedback";

/**
 * Renders a portal only for its role.
 * - Not signed in → /login?next=<current path> (plain /login after the user signed out)
 * - Signed in with another role → that role's own portal
 *
 * This is navigation, not security: the API refuses anything the role may not do.
 */
export default function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      // The only redirect after a sign-out, so two navigations never race.
      router.replace(session.signedOutByUser ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    } else if (session.status === "authenticated" && session.role !== role) {
      router.replace(portalHome(session.role!));
    }
  }, [session.status, session.role, session.signedOutByUser, role, pathname, router]);

  if (session.status === "error") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#e2e8f0] p-4">
        <div className="max-w-md w-full">
          <ErrorState error={null} title="Couldn't load your account" onRetry={session.retry} />
        </div>
      </div>
    );
  }

  if (session.status !== "authenticated" || session.role !== role) {
    return <FullPageLoader label={session.status === "unauthenticated" ? "Redirecting to sign in…" : "Loading…"} />;
  }

  return <>{children}</>;
}
