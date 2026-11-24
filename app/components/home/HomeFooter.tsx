"use client";

import Image from "@/app/components/ui/Image";
import Link from "next/link";
import { useSupportInfo } from "@/lib/queries/account";
import { SITE } from "@/lib/site/content";
import SocialLinks from "./SocialLinks";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { subscribersSupported } from "@/lib/subscribers/rules";
import { useEffect, useState } from "react";
import { SubscribeDialog } from "./Subscribe";
import { serif } from "./fonts";
import { Building2, Clock, Mail, MailPlus, Phone, Send } from "lucide-react";

/** The contact column: one row per detail, an amber icon before it. */
const CONTACT_ROW = "flex items-start gap-2.5";
const CONTACT_ICON = "mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-amber-400";

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
  const news = subscribersSupported(useBackendCapabilities().detection);
  // "Get ROF news" opens in a dialog (owner 2026-11-24); an address ending in #news opens it on arrival.
  const [newsOpen, setNewsOpen] = useState(false);
  useEffect(() => {
    if (!news) return;
    const openFromHash = () => {
      if (window.location.hash === "#news") setNewsOpen(true);
    };
    const first = window.setTimeout(openFromHash, 0);
    window.addEventListener("hashchange", openFromHash);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("hashchange", openFromHash);
    };
  }, [news]);
  return (
    <footer className="bg-brand-950 text-blue-100" aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">Footer</h2>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-0.5">
              <Image src="/logo.png" alt="" width={112} height={112} className="h-full w-full rounded-full object-cover" />
            </span>
            <span className="leading-tight">
              <span className={`${serif.className} block text-[1.5rem] font-medium text-white`}>ROF LMS</span>
              <span className="block text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-blue-100/70">{SITE.organisation}</span>
            </span>
          </div>
          <p className="mt-5 max-w-sm text-[0.875rem] leading-6 text-blue-100/80">{SITE.description}</p>
          <div className="mt-5">
            <SocialLinks />
          </div>
        </div>

        <nav aria-label="Quick links">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-amber-300">Quick links</h3>
          <ul className="mt-4 space-y-2.5 text-[0.875rem]">
            {QUICK.map((l) => (
              <li key={l.href}><a href={l.href} className="hover:text-amber-300">{l.label}</a></li>
            ))}
            <li><Link href="/login" className="hover:text-amber-300">Log in</Link></li>
          </ul>
        </nav>

        <nav aria-label="Learning resources">
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-amber-300">Learning resources</h3>
          <ul className="mt-4 space-y-2.5 text-[0.875rem]">
            {RESOURCES.map((l) => (
              <li key={l.href}><Link href={l.href} className="hover:text-amber-300">{l.label}</Link></li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-amber-300">Contact</h3>
          <ul className="mt-4 space-y-3 text-[0.875rem]">
            <li className={CONTACT_ROW}><Building2 className={CONTACT_ICON} strokeWidth={1.8} aria-hidden="true" /><span className="text-white">{SITE.organisation}</span></li>
            {info?.email && <li className={CONTACT_ROW}><Mail className={CONTACT_ICON} strokeWidth={1.8} aria-hidden="true" /><a href={`mailto:${info.email}`} className="break-all hover:text-amber-300">{info.email}</a></li>}
            {info?.phone && <li className={CONTACT_ROW}><Phone className={CONTACT_ICON} strokeWidth={1.8} aria-hidden="true" /><a href={`tel:${info.phone.replace(/[^\d+]/g, "")}`} className="hover:text-amber-300">{info.phone}</a></li>}
            {info?.hours && <li className={CONTACT_ROW}><Clock className={CONTACT_ICON} strokeWidth={1.8} aria-hidden="true" /><span>{info.hours}</span></li>}
            <li className={CONTACT_ROW}><Send className={CONTACT_ICON} strokeWidth={1.8} aria-hidden="true" /><a href="#contact" className="hover:text-amber-300">Send us a message</a></li>
            {news && (
              <li className={CONTACT_ROW}>
                <MailPlus className={CONTACT_ICON} strokeWidth={1.8} aria-hidden="true" />
                <a href="#news" onClick={(e) => { e.preventDefault(); setNewsOpen(true); }} className="hover:text-amber-300" data-testid="footer-news-link">
                  Get ROF news by e-mail
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 text-[0.8125rem] text-blue-100/70 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {SITE.organisation}. All rights reserved.</p>
          <p className="flex gap-5">
            <Link href="/support" className="hover:text-amber-300">Help and support</Link>
            <a href="#contact" className="hover:text-amber-300">Contact</a>
          </p>
        </div>
      </div>
      {newsOpen && <SubscribeDialog onClose={() => { setNewsOpen(false); if (window.location.hash === "#news") history.replaceState(null, "", window.location.pathname + window.location.search); }} />}
    </footer>
  );
}
