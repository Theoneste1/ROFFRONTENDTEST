import type { Metadata } from "next";
import PublicCard from "@/app/components/shell/PublicCard";
import HomeLinks from "@/app/components/shell/HomeLinks";

export const metadata: Metadata = { title: "Page not found" };

/** Any URL without a page (and `notFound()`): the ROF brand card with a way back. */
export default function NotFound() {
  return (
    <PublicCard>
      <div className="space-y-5 text-center" data-testid="not-found">
        <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Error 404</p>
        <h1 className="text-xl font-bold text-slate-900">Page not found</h1>
        <p className="text-sm text-slate-600">The page you are looking for does not exist or has moved. Check the address, or continue from your dashboard.</p>
        <HomeLinks />
      </div>
    </PublicCard>
  );
}
