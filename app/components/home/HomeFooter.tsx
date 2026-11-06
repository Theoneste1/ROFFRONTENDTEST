"use client";

import Image from "next/image";
import Link from "next/link";
import { useSupportInfo } from "@/lib/queries/account";
import { SITE } from "@/lib/site/content";
import SocialLinks from "./SocialLinks";

const QUICK = [
  { href: "#top", label: "Home" },
  { href: "#impact", label: "Our community" },
  { href: "#why-join", label: "Why join" },
  { href: "#partners", label: "Partners" },
  { href: "#contact", label: "Contact" },
];

/** Learning resources need an account; signed-out visitors are taken to sign in and then to the page. */
const RESOURCES = [
  { href: "/login?next=%2Fstudent%2Fcourses", label: "Courses and resources" },
  { href: "/login?next=%2Fstudent%2Fassignments", label: "Assignments" },
  { href: "/login?next=%2Fstudent%2Fleaderboard", label: "Leaderboard" },
  { href: "/support", label: "Help and support" },
];

export default function HomeFooter() {
  const info = useSupportInfo().data;
  return (
    <footer className="bg-[#000f2b] text-blue-100" aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">Footer</h2>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={44} height={44} className="h-11 w-11 rounded-full" />
            <span className="text-xl font-extrabold text-white">ROF LMS</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-blue-100/80">{SITE.description}</p>
          <div className="mt-6">
            <SocialLinks />
          </div>
        </div>

        <nav aria-label="Quick links">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Quick links</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {QUICK.map((l) => (
              <li key={l.href}><a href={l.href} className="hover:text-amber-300">{l.label}</a></li>
            ))}
            <li><Link href="/login" className="hover:text-amber-300">Log in</Link></li>
          </ul>
        </nav>

        <nav aria-label="Learning resources">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Learning resources</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {RESOURCES.map((l) => (
              <li key={l.href}><Link href={l.href} className="hover:text-amber-300">{l.label}</Link></li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">Contact</h3>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="text-white">{SITE.organisation}</li>
            {info?.email && <li><a href={`mailto:${info.email}`} className="hover:text-amber-300">{info.email}</a></li>}
            {info?.phone && <li><a href={`tel:${info.phone.replace(/[^\d+]/g, "")}`} className="hover:text-amber-300">{info.phone}</a></li>}
            {info?.hours && <li>{info.hours}</li>}
            <li><a href="#contact" className="hover:text-amber-300">Send us a message</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-6 text-center text-xs text-blue-100/60 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} {SITE.organisation}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
