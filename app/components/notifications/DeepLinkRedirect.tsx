"use client";

/**
 * Role-neutral notification links (`/assignments/:id`, `/results/:id`,
 * `/courses/:c/resources/:r`, `/discussions/:id`), as written by the backend
 * into notifications and e-mails. Sends the user to their own portal's page:
 * - signed out → sign in, then back here;
 * - signed in → the role's page (`lib/notifications/links.ts`);
 * - nothing for this role → a short explanation, never another portal.
 */
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth/session";
import { portalHome } from "@/lib/auth/roles";
import { resolveLink } from "@/lib/notifications/links";
import { useResult } from "@/lib/queries/assessment";
import { isApiError } from "@/lib/api/errors";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import PublicCard from "@/app/components/shell/PublicCard";

export default function DeepLinkRedirect() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const full = search ? `${pathname}?${search}` : pathname;
  const role = session.status === "authenticated" ? session.role : null;

  // A student's result link without the assignment id: look the result up.
  const resultId = pathname.match(/^\/results\/([\w-]+)\/?$/)?.[1] ?? null;
  const target = role ? resolveLink(full, role) : null;
  const needsLookup = role === "STUDENT" && !!resultId && target === `/results/${resultId}`;
  const result = useResult(resultId, needsLookup);
  const lookupMissing = needsLookup && result.isError && isApiError(result.error) && result.error.status === 404;
  const unavailable = !!role && (needsLookup ? lookupMissing : !target);

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(full)}`);
      return;
    }
    if (!role) return;
    if (needsLookup) {
      if (result.data) router.replace(`/student/assignments/${result.data.assignment.id}?tab=results`);
      return;
    }
    if (target) router.replace(target);
  }, [session.status, role, full, target, needsLookup, result.data, router]);

  if (session.status === "error") {
    return (
      <PublicCard>
        <ErrorState error={null} title="Couldn't load your account" onRetry={session.retry} />
      </PublicCard>
    );
  }

  if (needsLookup && result.isError && !unavailable) {
    return (
      <PublicCard>
        <ErrorState error={result.error} title="Couldn't open this result" onRetry={() => result.refetch()} />
      </PublicCard>
    );
  }

  if (unavailable && role) {
    return (
      <PublicCard>
        <div className="space-y-4 text-center">
          <h1 className="text-xl font-bold text-slate-900">This link isn&apos;t available</h1>
          <p className="text-sm text-slate-600">
            It may point to something that was removed, that isn&apos;t published yet, or that your account can&apos;t open.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href={portalHome(role)} className="px-5 py-2.5 rounded-lg bg-[#2B2BB2] text-white text-sm font-semibold hover:bg-[#232c94]">
              Go to my dashboard
            </Link>
            <Link
              href={`${portalHome(role).replace(/\/dashboard$/, "")}/notifications`}
              className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              My notifications
            </Link>
          </div>
        </div>
      </PublicCard>
    );
  }

  return (
    <PublicCard>
      <LoadingBlock label={session.status === "unauthenticated" ? "Redirecting to sign in…" : "Opening…"} />
    </PublicCard>
  );
}
