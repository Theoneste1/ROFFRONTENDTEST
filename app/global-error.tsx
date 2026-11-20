"use client";

import { useEffect } from "react";
import PublicCard from "@/app/components/shell/PublicCard";
import "./globals.css";

/**
 * An error in the root layout itself: replaces the whole document, so it has
 * its own <html>/<body> and styles and no session (plain links only). No
 * error details are shown.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full antialiased">
        <title>Something went wrong · ROF LMS</title>
        <PublicCard>
          <div className="space-y-5 text-center" role="alert">
            <h1 className="text-xl font-bold text-slate-900">Something went wrong</h1>
            <p className="text-sm text-slate-600">The site could not be loaded. Please try again in a moment.</p>
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Try again
            </button>
            {/* A full page load: the client router may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="block text-center text-sm font-medium text-brand hover:underline">
              Back to the home page
            </a>
          </div>
        </PublicCard>
      </body>
    </html>
  );
}
