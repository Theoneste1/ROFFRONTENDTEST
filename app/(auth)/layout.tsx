import Image from "next/image";
import type { ReactNode } from "react";

/** Public account pages: sign in, activation, password reset. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#e2e8f0] flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Brand block, same as the portal navbars */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0">
              <Image src="/logo.png" alt="Rwanda Olympiad Foundation" width={48} height={48} className="h-full w-full object-cover" priority />
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
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">{children}</div>

          <p className="mt-6 text-center text-xs text-slate-500">Rwanda Olympiad Foundation · Mathematics LMS</p>
        </div>
      </main>
    </div>
  );
}
