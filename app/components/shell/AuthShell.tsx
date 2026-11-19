"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpenCheck, Medal, MessagesSquare } from "lucide-react";
import Image from "@/app/components/ui/Image";
import { SITE } from "@/lib/site/content";

/**
 * The layout of every sign-in and account page (app/(auth)): sign in, student / coach / teacher
 * registration, activation, password recovery, help.
 *
 * - Large screens: a ROF photograph with the foundation's navy overlay, logo and what the platform
 *   offers on the left; the page's form on the right.
 * - Tablets and phones: a compact brand bar above the form; the form takes the full width.
 *
 * - Sign in and the registration pages (student, teacher, coach: FRAMED) draw their own page, one centred card with
 *   the brand panel inside it (app/components/auth/AuthCard, the approved reference design): this layout only passes
 *   them through.
 *
 * Images use explicit sizes and classes (no `fill`): the CSP blocks inline style attributes.
 * The ROF logo (both wordmarks) opens the ROF website; "Home" links keep going to the LMS home page.
 */
const HIGHLIGHTS = [
  { icon: BookOpenCheck, title: "Learn and practise", text: "Lessons, resources and assignments prepared by ROF coaches." },
  { icon: MessagesSquare, title: "Get feedback", text: "Coaches review your work and help you improve." },
  { icon: Medal, title: "Compete with confidence", text: "Prepare for national and international Olympiads." },
] as const;

function Wordmark({ tone }: { tone: "light" | "dark" }) {
  const text = tone === "light" ? "text-white" : "text-slate-900";
  const sub = tone === "light" ? "text-white/85" : "text-slate-700";
  const rule = tone === "light" ? "bg-white/40" : "bg-slate-300";
  return (
    <a href={SITE.website} className="inline-flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="Rwanda Olympiad Foundation website" data-testid="rof-logo-link">
      <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-white/70">
        <Image src="/logo.png" alt="" width={44} height={44} className="h-full w-full object-cover" priority />
      </span>
      <span className="flex items-center">
        <span className={`pr-3 text-2xl font-extrabold leading-none tracking-tight ${text}`}>ROF</span>
        <span className={`h-8 w-px ${rule}`} aria-hidden="true" />
        <span className={`pl-3 text-[10px] font-bold uppercase leading-tight tracking-wide ${sub}`}>
          <span className="block">Rwanda</span>
          <span className="block">Olympiad</span>
          <span className="block">Foundation</span>
        </span>
      </span>
    </a>
  );
}

/** The pages that draw their own card (app/components/auth/AuthCard). */
const FRAMED = new Set(["/login", "/register", "/register/teacher", "/apply"]);

export default function AuthShell({ children }: { children: ReactNode }) {
  const path = usePathname()?.replace(/\/$/, "") || "/";
  if (FRAMED.has(path)) return <>{children}</>;
  return (
    <div className="group/auth min-h-screen w-full bg-slate-50 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel (large screens) */}
      <aside className="relative hidden overflow-hidden bg-[#001E4E] lg:block" data-testid="auth-brand-panel">
        <div className="sticky top-0 flex h-screen flex-col justify-between p-10 xl:p-14">
          <Image
            src="/home/students-solving.jpg"
            alt="Students concentrating as they work through mathematics problems on paper"
            width={1280}
            height={1600}
            sizes="(min-width: 1280px) 50vw, 42vw"
            priority
            className="absolute inset-0 -z-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#001E4E]/95 via-[#001E4E]/85 to-[#00428c]/70" aria-hidden="true" />
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />

          <div className="relative">
            <Wordmark tone="light" />
          </div>

          <div className="relative max-w-md">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300 ring-1 ring-white/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
              ROF learning platform
            </p>
            <h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
              Where Rwanda&apos;s young problem-solvers <span className="text-amber-300">grow into Olympians</span>.
            </h2>
            <ul className="mt-8 space-y-5">
              {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-300 ring-1 ring-white/15">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{title}</span>
                    <span className="block text-sm text-white/75">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-white/60">© Rwanda Olympiad Foundation</p>
        </div>
      </aside>

      {/* Form side */}
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="pointer-events-none absolute -top-40 right-0 h-80 w-80 rounded-full bg-indigo-200/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute bottom-0 -left-32 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl" aria-hidden="true" />

        {/* Brand bar (phones and tablets) */}
        <header className="relative flex items-center justify-between px-4 pt-5 sm:px-8 lg:hidden">
          <Wordmark tone="dark" />
          <Link href="/" className="text-sm font-medium text-[#2B2BB2] hover:underline">
            Home
          </Link>
        </header>

        <main className="relative flex flex-1 items-start justify-center px-4 py-8 sm:px-8 sm:py-12 lg:items-center">
          <div className="w-full max-w-lg">
            <div className="rounded-3xl bg-white p-6 shadow-xl shadow-indigo-950/5 ring-1 ring-slate-200/80 sm:p-10" data-testid="auth-card">
              {children}
            </div>
          </div>
        </main>

        <footer className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-6 text-xs text-slate-600">
          <span>Rwanda Olympiad Foundation · Learning platform</span>
          <Link href="/support" className="font-medium text-slate-600 hover:text-[#2B2BB2] hover:underline">
            Help and support
          </Link>
          <Link href="/" className="hidden font-medium text-slate-600 hover:text-[#2B2BB2] hover:underline lg:inline">
            Home
          </Link>
        </footer>
      </div>
    </div>
  );
}
