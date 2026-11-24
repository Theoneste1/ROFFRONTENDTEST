import Link from "next/link";
import Image from "@/app/components/ui/Image";
import type { ReactNode } from "react";

/**
 * The centred brand card used by pages outside the portals: sign-in and
 * account pages, help and support, and notification link redirects.
 */
export default function PublicCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-canvas flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Brand block, same as the portal navbars */}
          <Link
            href="/"
            aria-label="ROF LMS home page"
            data-testid="rof-logo-link"
            className="flex w-fit mx-auto items-center justify-center gap-3 mb-8 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0">
              <Image src="/logo.png" alt="" width={48} height={48} className="h-full w-full object-cover" priority />
            </div>
            <div className="flex items-center">
              <div className="text-3xl font-extrabold tracking-tight text-gray-900 leading-none pr-3">ROF</div>
              <div className="h-9 w-px bg-gray-400" />
              <div className="text-xs font-bold tracking-wide text-gray-800 uppercase leading-tight pl-3">
                <div>Rwanda</div>
                <div>Olympiad</div>
                <div>Foundation</div>
              </div>
            </div>
          </Link>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">{children}</div>

          <p className="mt-6 text-center text-xs text-slate-600">Rwanda Olympiad Foundation · Mathematics LMS</p>
        </div>
      </main>
    </div>
  );
}
