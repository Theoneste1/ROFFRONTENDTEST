"use client";

import { useEffect } from "react";
import PublicCard from "@/app/components/shell/PublicCard";
import HomeLinks from "@/app/components/shell/HomeLinks";

/**
 * An unexpected error while rendering a page: the ROF brand card, a retry
 * and a way back. Never shows the error's message or stack (they may hold
 * internal details); the browser console keeps it for support.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <PublicCard>
      <div className="space-y-5 text-center" role="alert" data-testid="error-page">
        <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
        <p className="text-sm text-slate-600">This page could not be shown. Please try again; if it keeps happening, contact the Rwanda Olympiad Foundation team.</p>
        {digest && <p className="text-xs text-slate-400">Reference: {digest}</p>}
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex w-full items-center justify-center rounded-lg border border-[#2B2BB2] px-6 py-3 text-sm font-semibold text-[#2B2BB2] hover:bg-indigo-50"
        >
          Try again
        </button>
        <HomeLinks />
      </div>
    </PublicCard>
  );
}
