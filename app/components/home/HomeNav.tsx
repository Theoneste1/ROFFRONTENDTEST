"use client";

import { useEffect, useState } from "react";
import Image from "@/app/components/ui/Image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { portalHome } from "@/lib/auth/roles";

const LINKS = [
  { href: "#impact", label: "Our community" },
  { href: "#why-join", label: "Why join" },
  { href: "#partners", label: "Partners" },
  { href: "#contact", label: "Contact" },
];

/**
 * Sticky public navigation: section links and sign in / join. Signed-in users
 * do not stay on the public homepage (owner decision, 2026-11-07): once the
 * session check confirms them they are sent to their portal, as on /login.
 */
export default function HomeNav() {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const signedIn = session.status === "authenticated" && session.role;
  useEffect(() => {
    if (session.status === "authenticated" && session.role) router.replace(portalHome(session.role));
  }, [session.status, session.role, router]);
  const solid = scrolled || open;

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? "bg-[#001E4E]/95 shadow-lg backdrop-blur" : "bg-transparent"}`}>
      <nav className="mx-auto flex h-16 md:h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Main">
        <Link href="/" className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          <Image src="/logo.png" alt="" width={44} height={44} className="h-10 w-10 md:h-11 md:w-11 rounded-full" priority />
          <span className="leading-tight text-white">
            <span className="block text-lg font-extrabold tracking-tight">ROF LMS</span>
            <span className="hidden sm:block text-[11px] font-medium uppercase tracking-[0.18em] text-blue-100/80">Rwanda Olympiad Foundation</span>
          </span>
        </Link>

        <ul className="hidden lg:flex items-center gap-8 text-sm font-medium text-blue-50">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded hover:text-amber-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden lg:flex items-center gap-3">
          {signedIn ? (
            <Link href={portalHome(session.role!)} className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-[#001E4E] hover:bg-amber-300 transition-colors">
              My dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-full px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/10 transition-colors">
                Log in
              </Link>
              <a href="#join" className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-bold text-[#001E4E] hover:bg-amber-300 transition-colors">
                Join the community
              </a>
            </>
          )}
        </div>

        <button
          type="button"
          className="lg:hidden rounded-lg p-2 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="home-mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div id="home-mobile-menu" className="lg:hidden border-t border-white/10 bg-[#001E4E] px-4 pb-6 pt-2">
          <ul className="space-y-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-base font-medium text-blue-50 hover:bg-white/10">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-3">
            {signedIn ? (
              <Link href={portalHome(session.role!)} className="rounded-full bg-amber-400 px-5 py-3 text-center font-bold text-[#001E4E]">
                My dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-full px-5 py-3 text-center font-semibold text-white ring-1 ring-white/40">
                  Log in
                </Link>
                <a href="#join" onClick={() => setOpen(false)} className="rounded-full bg-amber-400 px-5 py-3 text-center font-bold text-[#001E4E]">
                  Join the community
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
