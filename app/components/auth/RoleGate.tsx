"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { portalHome, sharesPortal } from "@/lib/auth/roles";
import type { Role } from "@/lib/api/types";
import { ErrorState, FullPageLoader } from "@/app/components/ui/feedback";

/**
 * Renders a portal only for the roles that use it (`role` names the portal:
 * "ADMIN" also admits a Super Administrator; "MENTOR" also a Head Coach).
 * Portals (lib/auth/role-rules.ts): Student → /student, Teacher → /teacher,
 * Coach and Head Coach → /mentor, Administrator and Super Administrator → /admin.
 * - Not signed in → /login?next=<current path> (plain /login after the user signed out)
 * - Signed in with a role of another portal → that role's own portal
 * - An unknown role → the "no access configured" page, which is not gated, so
 *   this never loops.
 *
 * This is navigation, not security: the API refuses anything the role may not do.
 */
export default function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = session.status === "authenticated" && sharesPortal(session.role, role);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      // The only redirect after a sign-out, so two navigations never race.
      router.replace(session.signedOutByUser ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);
    } else if (session.status === "authenticated" && !allowed) {
      router.replace(portalHome(session.role));
    }
  }, [session.status, session.role, session.signedOutByUser, allowed, pathname, router]);

  if (session.status === "error") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#e2e8f0] p-4">
        <div className="max-w-md w-full">
          <ErrorState error={session.error} title="Couldn't load your account" onRetry={session.retry} />
        </div>
      </div>
    );
  }

  if (!allowed) {
    return <FullPageLoader label={session.status === "unauthenticated" ? "Redirecting to sign in…" : "Loading…"} />;
  }

  return <>{children}</>;
}
