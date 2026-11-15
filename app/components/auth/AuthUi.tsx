import Link from "next/link";
import type { ReactNode } from "react";
import { GraduationCap, Presentation, Trophy } from "lucide-react";

/**
 * Shared pieces of the sign-in and account pages (inside app/components/shell/AuthShell):
 * the page heading and the Student / Teacher / Coach switch of the registration pages.
 */

/** Title and short explanation at the top of every auth page. */
export function AuthHeading({ title, subtitle, eyebrow }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: string }) {
  return (
    <div>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2B2BB2]">{eyebrow}</p>}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
  );
}

export type JoinRole = "student" | "teacher" | "coach";

const ROLES: { role: JoinRole; label: string; href: string; icon: typeof GraduationCap }[] = [
  { role: "student", label: "Student", href: "/register", icon: GraduationCap },
  { role: "teacher", label: "Teacher", href: "/apply?as=teacher", icon: Presentation },
  { role: "coach", label: "Coach", href: "/apply", icon: Trophy },
];

/** Which kind of account to create: each is its own page and workflow; this only links between them. */
export function JoinSwitch({ active }: { active: JoinRole }) {
  return (
    <nav aria-label="Choose your account type" className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1" data-testid="join-switch">
      {ROLES.map(({ role, label, href, icon: Icon }) => {
        const on = role === active;
        return (
          <Link
            key={role}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              on ? "bg-white text-[#2B2BB2] shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** "New to ROF?": the three ways to join, under the sign-in form. */
export function JoinLinks() {
  return (
    <div className="space-y-3" data-testid="signup-links">
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        Don&apos;t have an account?
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {ROLES.map(({ role, label, href, icon: Icon }) => (
          <li key={role}>
            <Link
              href={href}
              className="flex h-full flex-col items-center gap-1.5 rounded-xl border border-slate-200 px-2 py-3 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-[#2B2BB2] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <Icon className="h-5 w-5 text-[#2B2BB2]" aria-hidden="true" />
              {role === "student" ? "Join as a student" : role === "teacher" ? "I'm a teacher" : "Apply as a coach"}
              <span className="sr-only">({label})</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A titled group of fields in a long form (e.g. "About you", "Your school"). */
export function FormSection({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {step != null && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-[#2B2BB2]" aria-hidden="true">
            {step}
          </span>
        )}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** "Already have an account? Sign in" under the registration forms. */
export function SignInInstead() {
  return (
    <p className="text-center text-sm text-slate-500">
      Already have an account?{" "}
      <Link href="/login" className="font-semibold text-[#2B2BB2] hover:underline">
        Sign in
      </Link>
    </p>
  );
}
