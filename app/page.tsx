"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { portalHome } from "@/lib/auth/roles";
import { ErrorState, FullPageLoader } from "@/app/components/ui/feedback";

/**
 * Entry point: signed-in users go to their own portal (admin, mentor or
 * student); everyone else goes to the sign-in page.
 */
export default function Home() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "authenticated" && session.role) router.replace(portalHome(session.role));
    else if (session.status === "unauthenticated") router.replace("/login");
  }, [session.status, session.role, router]);

  if (session.status === "error") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#e2e8f0] p-4">
        <div className="max-w-md w-full">
          <ErrorState error={null} title="Couldn't load your account" onRetry={session.retry} />
        </div>
      </div>
    );
  }

  return <FullPageLoader />;
}
