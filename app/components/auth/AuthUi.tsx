"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GraduationCap, Presentation, Trophy } from "lucide-react";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";

/**
 * Shared pieces of the sign-in and account pages (inside app/components/shell/AuthShell):
 * the page heading and the Student / Teacher / Coach switch of the registration pages.
 */

/** Title and short explanation at the top of every auth page (`compact`: the registration steps, which fit the window). */
export function AuthHeading({ title, subtitle, eyebrow, compact = false }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: string; compact?: boolean }) {
  return (
    <div>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2B2BB2]">{eyebrow}</p>}
      <h1 className={`tracking-tight text-slate-900 ${compact ? "text-[22px] font-extrabold leading-tight wizard-wide:text-[28px]" : "text-2xl font-bold sm:text-3xl"}`}>{title}</h1>
      {subtitle && <p className={`text-slate-600 ${compact ? "mt-1 text-sm leading-snug wizard-wide:text-[15px]" : "mt-2 text-sm leading-relaxed"}`}>{subtitle}</p>}
    </div>
  );
}

export type JoinRole = "student" | "teacher" | "coach";

const ROLES: { role: JoinRole; label: string; href: string; icon: typeof GraduationCap }[] = [
  { role: "student", label: "Student", href: "/register", icon: GraduationCap },
  { role: "teacher", label: "Teacher", href: "/apply?as=teacher", icon: Presentation },
  { role: "coach", label: "Coach", href: "/apply", icon: Trophy },
];

/**
 * Where each kind of account is created. Teachers: the teacher application (/register/teacher) on a
 * backend with `teacherSelfRegistration`; otherwise the page that explains how teachers join.
 */
function useJoinRoles() {
  const selfRegistration = hasFeature(useBackendCapabilities().detection, "teacherSelfRegistration");
  return ROLES.map((r) => (r.role === "teacher" && selfRegistration ? { ...r, href: "/register/teacher" } : r));
}

/**
 * Which kind of account to create: each is its own page and workflow; this only links between them (`compact`: the small
 * segmented control beside the heading of the registration forms).
 */
export function JoinSwitch({ active, compact = false }: { active: JoinRole; compact?: boolean }) {
  const roles = useJoinRoles();
  return (
    <nav
      aria-label="Choose your account type"
      className={compact ? "grid grid-cols-3 gap-0.5 rounded-xl bg-slate-100 p-1 ring-1 ring-slate-200 wizard-wide:inline-grid" : "grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1"}
      data-testid="join-switch"
    >
      {roles.map(({ role, label, href, icon: Icon }) => {
        const on = role === active;
        return (
          <Link
            key={role}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center justify-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 ${
              compact ? "min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:ring-brand wizard-wide:min-h-9 wizard-wide:text-[13px]" : "rounded-xl px-2 py-2.5 text-sm font-semibold focus-visible:ring-indigo-500"
            } ${on ? `bg-white shadow-sm ring-1 ring-slate-200 ${compact ? "text-brand" : "text-[#2B2BB2]"}` : "text-slate-600 hover:text-slate-800"}`}
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
  const roles = useJoinRoles();
  return (
    <div className="space-y-3" data-testid="signup-links">
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-500">
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        Don&apos;t have an account?
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {roles.map(({ role, label, href, icon: Icon }) => (
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
    <p className="text-center text-sm text-slate-700">
      Already have an account?{" "}
      <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">
        Sign in
      </Link>
    </p>
  );
}
