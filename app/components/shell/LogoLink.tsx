"use client";

/**
 * The ROF logo's link (owner 2026-11-28): for a signed-in person, clicking the logo SIGNS OUT securely — the session's
 * own sign-out (server session revoked, access token blacklisted, this tab's data cleared, every other tab signed out)
 * — and only then goes to the public home page. Signed out, it is a plain link to the home page. The design of each
 * logo is unchanged (the caller renders it). Used by every logo: the portal top bar, the sign-in pages' brand mark,
 * the public card (error and not-found pages) and the public home page's navigation.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useOptionalSession } from "@/lib/auth/session";
import { useInsideRoleGate } from "@/lib/auth/role-gate-context";

export const HOME_PATH = "/";

export default function LogoLink({ children, className, testId, label = "ROF LMS home page" }: {
  children: ReactNode; className?: string; testId?: string; label?: string;
}) {
  const session = useOptionalSession();
  const insideGate = useInsideRoleGate();
  const router = useRouter();
  const busy = useRef(false);
  // Visible while the server signs the session out (it can take a moment on a slow connection).
  const [signingOut, setSigningOut] = useState(false);
  // Signed in (or signed in but the server is briefly unreachable — still a session to end).
  const signedIn = session !== null && (session.status === "authenticated" || (session.status === "error" && session.user !== null));

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!signedIn || !session) return;   // a plain link home
    e.preventDefault();                  // never navigate before the sign-out has finished
    if (busy.current) return;            // a double click signs out once
    busy.current = true;
    setSigningOut(true);
    void session.logout({ to: HOME_PATH }).then(() => {
      // Inside a portal RoleGate makes the one navigation (to afterSignOut); elsewhere this link does.
      if (!insideGate) router.replace(HOME_PATH);
    }).finally(() => { busy.current = false; setSigningOut(false); });
  };

  return (
    <Link href={HOME_PATH} onClick={onClick} aria-label={signedIn ? "Sign out and go to the ROF LMS home page" : label} data-testid={testId}
      data-signs-out={signedIn ? "true" : undefined} aria-busy={signingOut || undefined}
      className={`${className ?? ""}${signingOut ? " cursor-progress opacity-60" : ""}`}>
      {children}
      {signingOut && <span className="sr-only" role="status">Signing out…</span>}
    </Link>
  );
}
