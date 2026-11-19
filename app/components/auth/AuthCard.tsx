import Link from "next/link";
import type { ReactNode } from "react";
import Image from "@/app/components/ui/Image";

/**
 * The sign-up pages (the owner's approved reference design): a light page with ONE centred rounded card. On
 * large screens (1024px and up) the card holds a deep-blue brand panel on the left (the ROF logo, "ROF LMS", a headline,
 * a short text and a real ROF photograph) and the page's form on the right; below 1024px the panel becomes a slim blue
 * bar at the top of the card and the form takes the full width. The card fits the window at the agreed sizes; a window
 * too short for it lets the page scroll rather than cut anything off.
 *
 * Images use explicit sizes and classes (no `fill`): the CSP blocks inline style attributes.
 */

export type SignupBrand = "student" | "teacher" | "coach";

interface BrandCopy {
  headline: string;
  text: string;
  photo: string;
  alt: string;
  /** Which part of the photograph stays in view (object-position classes). */
  focus: string;
}

const BRANDS: Record<SignupBrand, BrandCopy> = {
  student: {
    headline: "Join our learning community",
    text: "Create your account to access courses, resources and more.",
    photo: "/home/students-solving.jpg",
    alt: "ROF students working through olympiad problems together with a coach",
    focus: "object-[62%_50%]",
  },
  teacher: {
    headline: "Teach with ROF",
    text: "Help your students prepare for the Olympiads with ROF lessons, resources and coaches.",
    photo: "/home/teacher-explaining.jpg",
    alt: "A teacher explaining a problem to a group of students",
    focus: "object-[58%_50%]",
  },
  coach: {
    headline: "Coach the next Olympians",
    text: "Mentor ROF students: prepare assignments, share resources and review their work.",
    photo: "/home/pamo-team.jpg",
    alt: "Rwanda's olympiad team with their medals",
    focus: "object-[50%_45%]",
  },
};

/** The ROF logo in a white rounded tile, "ROF LMS" and the tagline (`size`: the panel's or the slim bar's). */
function BrandMark({ size }: { size: "panel" | "bar" }) {
  const panel = size === "panel";
  return (
    <Link href="/" className="inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="ROF LMS home page" data-testid="auth-brand-home">
      <span className={`flex flex-shrink-0 items-center justify-center overflow-hidden bg-white shadow-sm ${panel ? "h-14 w-14 rounded-2xl p-1.5" : "h-9 w-9 rounded-xl p-1"}`}>
        <Image src="/logo.png" alt="" width={panel ? 44 : 28} height={panel ? 44 : 28} className="h-full w-full rounded-lg object-cover" priority />
      </span>
      <span className="leading-none">
        <span className={`block font-extrabold tracking-tight text-white ${panel ? "text-[32px]" : "text-lg"}`}>ROF LMS</span>
        <span className={`block font-medium text-white/90 ${panel ? "mt-1.5 text-sm" : "mt-0.5 text-[11px]"}`}>Learn • Practice • Achieve</span>
      </span>
    </Link>
  );
}

const PAGE = "flex min-h-dvh w-full items-center justify-center bg-[#eef2f8] p-2 font-sans sm:p-4";
const CARD =
  "flex w-full flex-col rounded-[20px] bg-white shadow-[0_24px_64px_-24px_rgba(15,40,90,0.28)] ring-1 ring-slate-200/70 lg:min-h-[min(760px,calc(100dvh-2rem))] lg:flex-row lg:rounded-[28px]";

/** The slim blue bar at the top of the card below 1024px (the brand panel's place on phones and tablets). */
function SlimBar() {
  return (
    <header className="flex items-center rounded-t-[20px] bg-gradient-to-r from-brand-deep to-brand px-4 py-1.5 sm:px-6 sm:py-2 lg:hidden" data-testid="auth-brand-bar">
      <BrandMark size="bar" />
    </header>
  );
}

/** A registration page (Student, Teacher, Coach): the blue panel with the form's headline and photograph, the form beside it. */
export function SignupCard({ brand, children }: { brand: SignupBrand; children: ReactNode }) {
  const b = BRANDS[brand];
  return (
    <div className={PAGE} data-auth-frame="signup">
      <div className={`${CARD} max-w-[1200px]`} data-testid="auth-card">
        <aside className="relative hidden w-[38%] flex-shrink-0 flex-col overflow-hidden rounded-l-[28px] bg-[#1a5bc4] lg:flex" data-testid="auth-brand-panel">
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#2a6fd9] to-transparent" aria-hidden="true" />
          <div className="relative z-[2] px-10 pt-10 xl:px-12 xl:pt-12">
            <BrandMark size="panel" />
            <p className="mt-10 text-[34px] font-extrabold leading-[1.12] tracking-tight text-white xl:text-[40px]">{b.headline}</p>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-white/95 xl:text-lg">{b.text}</p>
          </div>
          {/* The photograph fills the lower part and fades into the blue above it. */}
          <div className="relative mt-auto h-[52%] min-h-[220px]">
            <Image src={b.photo} alt={b.alt} width={960} height={540} sizes="(min-width: 1024px) 38vw, 1px" priority className={`absolute inset-0 h-full w-full object-cover ${b.focus}`} />
            <div className="absolute inset-x-0 top-0 h-3/5 bg-gradient-to-b from-[#1a5bc4] via-[#1a5bc4]/50 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-brand-deep/40 to-transparent" aria-hidden="true" />
          </div>
        </aside>
        <SlimBar />
        <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-3 sm:px-8 sm:py-5 lg:px-12 lg:py-6 xl:px-14">{children}</div>
      </div>
    </div>
  );
}
