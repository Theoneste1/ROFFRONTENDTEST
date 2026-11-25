"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpenCheck, Medal, MessagesSquare } from "lucide-react";
import Image from "@/app/components/ui/Image";

/**
 * The layout of every sign-in and account page (app/(auth)): sign in, student / coach / teacher registration,
 * activation, password recovery, help. One look for all of them:
 *
 * - Large screens (1024px and up): a split page. On the left a brand panel in the logo's colour (#00428C) over a ROF
 *   photograph (a full-bleed background under a strong overlay, a subtle texture) with the ROF logo, "ROF LMS", a short
 *   welcome line for the page and what the platform offers; its content stays in view while the page scrolls. On the right, on a light background, the page's form on a white card (narrow for sign in and the
 *   account pages, wider for the registration forms, which are one continuous form and scroll with the page).
 * - Phones and tablets: a compact brand header in the logo's colour (logo, "ROF LMS", Help) and the form at full width.
 *
 * Images use explicit sizes and classes (no `fill`): the CSP blocks inline style attributes.
 */

interface Welcome {
  title: string;
  text: string;
}

const WELCOME: Record<string, Welcome> = {
  "/login": { title: "Welcome back", text: "Your Olympiad journey continues here. Sign in to learn, practise and challenge yourself." },
  "/register": { title: "Join our learning community", text: "Create your free account to access lessons, resources and Olympiad practice." },
  "/register/teacher": { title: "Teach with ROF", text: "Help your students prepare for the Olympiads with ROF lessons, resources and coaches." },
  "/apply": { title: "Grow the next Olympians", text: "Mentor ROF students as a coach, or connect your school as a teacher." },
};
const DEFAULT_WELCOME: Welcome = { title: "Rwanda Olympiad Foundation", text: "The learning platform for Rwanda's young problem-solvers." };

/**
 * The shared form controls (app/components/ui/form) in the logo's colour on these pages only: focus border and ring of
 * inputs, dropdowns and text areas, and the tick of check boxes.
 */
const BRAND_CONTROLS = [
  "[&_:is(input,select,textarea):focus]:!border-brand [&_:is(input,select,textarea):focus]:!ring-brand/20",
  "[&_input[type=checkbox]]:accent-brand [&_input[type=checkbox]:focus-visible]:outline-brand",
].join(" ");

/** The registration forms: long, two columns on wider windows (a wider card). */
const WIDE = new Set(["/register", "/register/teacher", "/apply"]);

const HIGHLIGHTS = [
  { icon: BookOpenCheck, text: "Lessons, resources and assignments from ROF coaches" },
  { icon: MessagesSquare, text: "Feedback that helps you improve" },
  { icon: Medal, text: "Preparation for national and international Olympiads" },
] as const;

/** The ROF logo on a white tile, "ROF LMS" and the tagline; it opens the LMS home page. */
function BrandMark({ size }: { size: "panel" | "bar" }) {
  const panel = size === "panel";
  return (
    <Link href="/" className="inline-flex items-center gap-4 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="ROF LMS home page" data-testid="auth-brand-home">
      <span className={`flex flex-shrink-0 items-center justify-center overflow-hidden bg-white ${panel ? "h-20 w-20 rounded-2xl p-0.5 shadow-md shadow-black/10" : "h-12 w-12 rounded-xl p-0.5"}`}>
        <Image src="/logo.png" alt="" width={panel ? 160 : 96} height={panel ? 160 : 96} className="h-full w-full rounded-[0.875rem] object-cover" priority />
      </span>
      <span className="leading-none">
        <span className={`block font-serif font-medium text-white ${panel ? "text-[2rem]" : "text-[1.375rem]"}`}>ROF LMS</span>
        <span className={`block font-normal text-white/80 ${panel ? "mt-1.5 text-sm" : "mt-0.5 text-xs"}`}>Learn • Practise • Achieve</span>
      </span>
    </Link>
  );
}

export default function AuthShell({ children }: { children: ReactNode }) {
  const path = usePathname()?.replace(/\/$/, "") || "/";
  const welcome = WELCOME[path] ?? DEFAULT_WELCOME;
  const wide = WIDE.has(path);
  return (
    <div className="min-h-dvh w-full bg-white font-sans lg:grid lg:grid-cols-[minmax(380px,5fr)_7fr] lg:bg-[#f5f6fb]" data-auth-frame={wide ? "signup" : "login"}>
      {/* Brand panel (large screens): stays in view while the form scrolls. */}
      <aside className="relative hidden overflow-hidden bg-brand lg:sticky lg:top-0 lg:block lg:h-dvh lg:self-start" data-testid="auth-brand-panel">
        {/* A ROF photograph as a subtle texture behind the text: full-bleed, under a strong overlay in the logo's colour. */}
        <Image
          src="/home/students-solving.jpg"
          alt=""
          width={1280}
          height={1600}
          sizes="(min-width: 1024px) 42vw, 1px"
          priority
          className="absolute inset-0 h-full w-full object-cover object-[55%_45%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-brand/90 via-brand/[0.93] to-brand-deep/[0.97]" aria-hidden="true" />
        <div className="relative flex h-full flex-col px-12 py-10 xl:px-16 xl:py-12">
          <BrandMark size="panel" />
          <div className="mt-auto max-w-md">
            <h2 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white xl:text-[44px]">{welcome.title}</h2>
            <p className="mt-4 text-base leading-relaxed text-white/90 xl:text-lg">{welcome.text}</p>
            <ul className="mt-8 space-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-white">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-10 text-xs text-white/80">© Rwanda Olympiad Foundation</p>
        </div>
      </aside>

      {/* Phones and tablets: a compact brand header. */}
      <header className="flex items-center justify-between bg-brand px-5 py-3 sm:px-8 lg:hidden" data-testid="auth-brand-bar">
        <BrandMark size="bar" />
        <Link href="/support" className="text-sm font-medium text-white/90 hover:text-white hover:underline">
          Help
        </Link>
      </header>

      {/* The page's form. */}
      <main className={`flex min-w-0 justify-center px-5 py-6 sm:px-8 sm:py-10 lg:px-12 lg:py-12 ${wide ? "lg:items-start" : "lg:min-h-dvh lg:items-center"}`}>
        <div
          className={`w-full ${wide ? "max-w-[720px] xl:p-12" : "max-w-[440px]"} lg:rounded-2xl lg:bg-white lg:p-10 lg:shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.12)] lg:ring-1 lg:ring-slate-200/80 ${BRAND_CONTROLS}`}
          data-testid="auth-card"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
