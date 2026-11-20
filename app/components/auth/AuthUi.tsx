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

/** Title and short explanation at the top of every auth page (sign in, the registration forms, account pages). */
export function AuthHeading({ title, subtitle, eyebrow }: { title: ReactNode; subtitle?: ReactNode; eyebrow?: string }) {
  return (
    <div>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
      <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[30px]">{title}</h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{subtitle}</p>}
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
 * Which kind of account to create: each is its own page and workflow; this only links between them (a segmented control
 * above the heading of the registration pages).
 */
export function JoinSwitch({ active }: { active: JoinRole }) {
  const roles = useJoinRoles();
  return (
    <nav aria-label="Choose your account type" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200/80" data-testid="join-switch">
      {roles.map(({ role, label, href, icon: Icon }) => {
        const on = role === active;
        return (
          <Link
            key={role}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              on ? "bg-white text-brand shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
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
