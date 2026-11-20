"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth/session";
import { hasPortal, portalHome } from "@/lib/auth/roles";

const primary =
  "inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";
const secondary = "text-center text-sm font-medium text-brand hover:underline";

/**
 * The way out of an error or "not found" page: the signed-in user's portal
 * when they have one, otherwise the home page; help and support below.
 */
export default function HomeLinks() {
  const session = useSession();
  const portal = session.status === "authenticated" && hasPortal(session.role) ? portalHome(session.role) : null;
  return (
    <div className="flex flex-col gap-3">
      {portal ? (
        <>
          <Link href={portal} className={primary} data-testid="home-link">
            Go to my dashboard
          </Link>
          <Link href="/" className={secondary}>
            Home page
          </Link>
        </>
      ) : (
        <Link href="/" className={primary} data-testid="home-link">
          Back to the home page
        </Link>
      )}
      <Link href="/support" className={secondary}>
        Help and support
      </Link>
    </div>
  );
}
