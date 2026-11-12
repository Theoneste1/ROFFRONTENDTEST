"use client";

/**
 * "No access configured": the account is signed in, but its role has no
 * portal on this site yet. Never redirects back into a portal gate (no loop):
 * - signed out → offers sign-in;
 * - a role that does have a portal (e.g. after its role changed) → that portal;
 * - otherwise → explanation, sign out, help.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { hasPortal, portalHome, roleLabel } from "@/lib/auth/roles";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";

export default function NoAccess() {
  const session = useSession();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const withPortal = session.status === "authenticated" && hasPortal(session.role);

  useEffect(() => {
    if (withPortal) router.replace(portalHome(session.role));
  }, [withPortal, session.role, router]);

  if (session.status === "loading" || withPortal) return <LoadingBlock />;

  if (session.status === "error") {
    return <ErrorState error={session.error} title="Couldn't load your account" onRetry={session.retry} />;
  }

  if (session.status === "unauthenticated") {
    return (
      <div className="space-y-5 text-center">
        <h1 className="text-xl font-bold text-slate-900">You are signed out</h1>
        <Link href="/login" className="inline-flex w-full items-center justify-center rounded-lg bg-[#2B2BB2] px-6 py-3 text-sm font-semibold text-white hover:bg-[#232c94]">
          Sign in
        </Link>
      </div>
    );
  }

  const label = roleLabel(session.role);
  return (
    <div className="space-y-5" data-testid="no-access">
      <h1 className="text-xl font-bold text-slate-900">No access configured yet</h1>
      <Alert tone="info">
        You are signed in{session.user ? <> as <strong>{session.user.username}</strong></> : null} with the account type <strong>{label}</strong>.
      </Alert>
      <p className="text-sm text-slate-700">
        This website does not have pages for this account type yet. Your account itself is fine: nothing has been changed or removed.
        Please contact the Rwanda Olympiad Foundation team if you need access now.
      </p>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          className="w-full"
          loading={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await session.logout();
            router.replace("/login");
          }}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
        <Link href="/support" className="text-center text-sm font-medium text-[#2B2BB2] hover:underline">
          Help and support
        </Link>
      </div>
    </div>
  );
}
