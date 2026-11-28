'use client';

/**
 * The user guide, read inside the system (owner, 2026-11-28: "easily accessible and viewable directly within the system,
 * rather than requiring users to download it every time"). The same text as the Help panel and the PDF
 * (lib/help/content-*.ts): getting started from signing in, then every page of the portal in menu order, each with a
 * link of its own (#topic-id), a search over the whole guide, and the PDF as an option for printing or sending.
 * Administrators and Super Administrators can read every role's guide (?for=COACH).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp, BookOpen, Download, LifeBuoy, Search } from "lucide-react";
import Image from "@/app/components/ui/Image";
import { useSession } from "@/lib/auth/session";
import {
  ALL_HELP_ROLES, SUPPORT_PAGE, guideFileName, guideFor, guidePagePath, guideShown, guideUrl, helpRoleOf, searchTopics,
  type HelpTopic,
} from "@/lib/help/rules";
import HelpTopicBody from "./HelpTopicBody";
import { SupportButton, SupportDetails } from "./SupportContact";

export default function UserGuide() {
  const { user } = useSession();
  const params = useSearchParams();
  const reader = helpRoleOf(user?.role);
  const [query, setQuery] = useState("");
  const shown = reader ? guideShown(reader, params.get("for")) : null;
  const guide = shown ? guideFor(shown) : null;
  // Arriving with a section link (/mentor/guide#coach-dashboard, e.g. from Help): the sections exist only once the
  // session has loaded, after the browser looked for the anchor — scroll to it now that it is on the page.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id && guide) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [guide]);
  if (!reader || !shown || !guide) return null;
  const sections = [
    { key: "start", title: "Getting started", topics: searchTopics(guide.gettingStarted, query) },
    { key: "pages", title: "Every page", topics: searchTopics(guide.topics, query) },
  ];
  const everyRole = reader === "ADMIN" || reader === "SUPER_ADMIN";
  const found = sections.reduce((n, s) => n + s.topics.length, 0);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-8" data-testid="user-guide">
      <header className="rounded-3xl bg-brand-950 px-6 py-6 text-white sm:px-8">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-300">
          <BookOpen className="h-4 w-4" aria-hidden="true" /> User guide
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight" data-testid="user-guide-title">ROF LMS for {guide.audience}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100/85">
          Every page explained, starting from signing in. Use the contents or the search to go straight to what you need.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={guideUrl(shown)}
            download={guideFileName(shown)}
            data-testid="user-guide-download"
            className="inline-flex items-center gap-2 rounded-full border border-white/40 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Download as PDF (optional)
          </a>
          <SupportButton
            pageTitle="User guide"
            testId="user-guide-support"
            className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[0.8125rem] font-semibold text-brand-950 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          />
        </div>
      </header>

      {everyRole && (
        <nav aria-label="Guides for every role" className="mt-4 flex flex-wrap gap-2" data-testid="user-guide-roles">
          {ALL_HELP_ROLES.map((r) => (
            <Link
              key={r}
              href={r === reader ? guidePagePath(reader) : `${guidePagePath(reader)}?for=${r}`}
              aria-current={r === shown ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                r === shown ? "bg-brand text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-brand-50"
              }`}
            >
              {guideFor(r).audience}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <label className="relative block">
            <span className="sr-only">Search the guide</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the guide"
              data-testid="user-guide-search"
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </label>
          {/* Desktop: the contents stay beside the guide. Phone: folded under "Contents", so the guide starts on screen. */}
          <nav aria-label="Contents" className="mt-4 hidden rounded-2xl border border-slate-200 bg-white p-3 lg:block" data-testid="user-guide-contents">
            <Contents sections={sections} found={found} />
          </nav>
          <details className="group mt-4 rounded-2xl border border-slate-200 bg-white lg:hidden" data-testid="user-guide-contents-phone">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-brand-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
              Contents <span className="text-xs font-medium text-slate-500">{found} sections</span>
            </summary>
            <nav aria-label="Contents" className="border-t border-slate-200 p-3">
              <Contents sections={sections} found={found} />
            </nav>
          </details>
        </aside>

        <div className="min-w-0 space-y-8">
          {found === 0 && (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600" role="status" data-testid="user-guide-empty">
              Nothing in this guide matches “{query}”. Try another word, or contact ROF support.
            </p>
          )}
          {sections.map((s) => s.topics.length > 0 && (
            <section key={s.key} aria-labelledby={`guide-${s.key}`}>
              <h2 id={`guide-${s.key}`} className="mb-3 font-serif text-2xl font-semibold text-brand-950">{s.title}</h2>
              <div className="space-y-4">
                {s.topics.map((t) => <TopicCard key={t.id} topic={t} />)}
              </div>
            </section>
          ))}
        </div>
      </div>

      <GuideFooter audience={guide.audience} pdfUrl={guideUrl(shown)} pdfName={guideFileName(shown)} />
    </div>
  );
}

/** The end of the guide: who it is for, help on WhatsApp, and the ways on (top, PDF, Help and Support). */
function GuideFooter({ audience, pdfUrl, pdfName }: { audience: string; pdfUrl: string; pdfName: string }) {
  const link = "inline-flex items-center gap-2 rounded-lg py-1 text-sm text-blue-100/85 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";
  return (
    <footer className="relative mt-12 overflow-hidden rounded-3xl bg-brand-950 text-white" data-testid="user-guide-footer">
      {/* A thin amber line along the top and soft brand light in the corner: the site's colours, nothing else. */}
      <div className="h-1 w-full bg-gradient-to-r from-amber-300 via-amber-200 to-amber-300" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-3xl" aria-hidden="true" />
      <div className="relative grid gap-8 px-6 py-8 sm:px-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)] md:gap-10">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 flex-none overflow-hidden rounded-full bg-white ring-2 ring-white/20">
              <Image src="/logo.png" alt="" width={44} height={44} className="h-full w-full object-cover" />
            </span>
            <div className="leading-tight">
              <p className="font-serif text-xl font-semibold">ROF LMS</p>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-amber-300">Rwanda Olympiad Foundation</p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-blue-100/80">
            The user guide for {audience.toLowerCase()}: every page explained, starting from signing in.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="font-serif text-lg font-semibold">Still stuck?</p>
          <p className="mt-1 text-sm leading-6 text-blue-100/80">Contact ROF support and tell them which page you are on.</p>
          <div className="mt-3"><SupportDetails tone="dark" /></div>
          <SupportButton
            pageTitle="User guide"
            testId="user-guide-footer-whatsapp"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-[0.8125rem] font-bold text-brand-950 shadow-sm transition-colors hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-950"
          />
        </div>

        <nav aria-label="Guide links" className="flex flex-col gap-1.5">
          <p className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-amber-300">Quick links</p>
          <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={link}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" /> Back to the top
          </a>
          <a href={pdfUrl} download={pdfName} className={link}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download as PDF
          </a>
          <Link href={SUPPORT_PAGE} className={link}>
            <LifeBuoy className="h-4 w-4" aria-hidden="true" /> Help and Support
          </Link>
        </nav>
      </div>
      <div className="relative flex flex-col gap-1 border-t border-white/10 px-6 py-4 text-xs text-blue-100/60 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>© {new Date().getFullYear()} Rwanda Olympiad Foundation</span>
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" /> Read it here any time; no download needed</span>
      </div>
    </footer>
  );
}

function Contents({ sections, found }: { sections: Array<{ key: string; title: string; topics: HelpTopic[] }>; found: number }) {
  return (
    <>
      {sections.map((s) => s.topics.length > 0 && (
        <div key={s.key} className="mb-2 last:mb-0">
          <p className="px-2 pb-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand">{s.title}</p>
          <ul>
            {s.topics.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="block rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{t.title}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {found === 0 && <p className="px-2 py-1 text-sm text-slate-500">No section matches.</p>}
    </>
  );
}

function TopicCard({ topic }: { topic: HelpTopic }) {
  return (
    <article id={topic.id} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-5 text-[0.9375rem] leading-7 text-slate-900 shadow-sm" data-testid="user-guide-topic">
      <h3 className="mb-3 text-lg font-semibold text-brand-950">
        <a href={`#${topic.id}`} className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{topic.title}</a>
      </h3>
      <div className="space-y-4">
        <HelpTopicBody topic={topic} summaryHeading="What it is for" />
      </div>
    </article>
  );
}
