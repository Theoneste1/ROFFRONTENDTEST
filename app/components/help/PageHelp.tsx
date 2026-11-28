'use client';

/**
 * Page help (owner, 2026-11-26): the Help button of the portal top bar and its panel — the guide for THIS page, written
 * for the signed-in role, the technical support contact on WhatsApp, the full user guide inside the system (owner,
 * 2026-11-28; the PDF stays an option) and the credit "Made by Theoneste, Technology lead". Desktop: a panel on the right; phone: a sheet from the bottom.
 * Closed by default (owner, 2026-11-26): it opens only when the person presses Help, and closes when they leave the page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, CircleHelp, Download, MessageCircle, X } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { ALL_HELP_ROLES, EVERY_ROLE_GUIDE, TECH_SUPPORT, generalTopic, guideFileName, guideFor, guidePagePath, guideUrl, helpRoleOf, topicFor, whatsappUrl, type HelpRole } from "@/lib/help/rules";
import HelpTopicBody from "./HelpTopicBody";

export default function PageHelp() {
  const { user } = useSession();
  const pathname = usePathname() ?? "/";
  const role = helpRoleOf(user?.role);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // A new page closes the panel: its guide is for the page it was opened on.
  const [openOn, setOpenOn] = useState(pathname);
  if (openOn !== pathname) { setOpenOn(pathname); setOpen(false); }

  const topic = role ? topicFor(role, pathname) ?? generalTopic(role) : null;
  if (!role || !topic || !user) return null;
  const close = () => { setOpen(false); buttonRef.current?.focus(); };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="page-help-button"
        className="inline-flex items-center gap-1.5 rounded-full bg-brand py-1.5 pl-1.5 pr-3 text-[0.8125rem] font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2"
      >
        <CircleHelp className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        <span className="hidden sm:inline">Help</span>
        <span className="sr-only sm:hidden">Help for this page</span>
      </button>
      {open && <HelpPanel role={role} topic={topic} onClose={close} />}
    </>
  );
}

function HelpPanel({ role, topic, onClose }: { role: HelpRole; topic: NonNullable<ReturnType<typeof topicFor>>; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const guide = guideFor(role);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  // Focus moves into the panel once when it opens; Escape closes it.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Phone: dim the page behind the sheet; a tap outside closes it. */}
      <div className="fixed inset-0 z-40 bg-brand-950/35 md:hidden" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="page-help-panel"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none
                   md:inset-x-auto md:bottom-4 md:right-4 md:top-24 md:max-h-none md:w-[360px] md:rounded-2xl md:border md:border-slate-300"
      >
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 md:hidden" aria-hidden="true" />
        <div className="flex items-start gap-3 border-b border-slate-200 bg-gradient-to-b from-brand-50 to-white px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-serif text-[1.35rem] font-semibold leading-tight text-brand-950">How this page works</h2>
            <span className="mt-1.5 inline-block rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand" data-testid="page-help-topic">
              {topic.title} · for {guide.audience}
            </span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close help" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 text-[0.875rem] leading-6 text-slate-900">
          <HelpTopicBody topic={topic} />

          <section className="rounded-xl border border-brand-100 bg-brand-50 p-3.5" data-testid="page-help-support">
            <h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand">Technical support</h3>
            <p className="mt-1 text-slate-700">
              Contact <span className="font-semibold text-brand-950">{TECH_SUPPORT.name}</span>, {TECH_SUPPORT.title}, on WhatsApp:{" "}
              <span className="font-semibold tabular-nums text-brand-950">{TECH_SUPPORT.phoneDisplay}</span>
            </p>
            <a
              href={whatsappUrl(topic.title)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="page-help-whatsapp"
              className="mt-2.5 inline-flex items-center gap-2 rounded-full bg-brand px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Chat on WhatsApp
            </a>
          </section>

          <section>
            <Link
              href={guidePagePath(role, topic.id === "general" ? undefined : topic.id)}
              onClick={onClose}
              data-testid="page-help-guide"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-semibold text-white hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Open the full user guide
            </Link>
            <p className="mt-1.5 text-center text-xs text-slate-500">
              Every page for {guide.audience.toLowerCase()}, starting from signing in. Or{" "}
              <a href={guideUrl(role)} download={guideFileName(role)} data-testid="page-help-download" className="font-semibold text-brand underline hover:text-brand-dark">
                download it as a PDF
              </a>.
            </p>
          </section>

          {(role === "ADMIN" || role === "SUPER_ADMIN") && (
            <section data-testid="page-help-all-guides">
              <h3 className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-brand">Guides for every role</h3>
              <p className="mb-2 text-slate-600">See exactly what each person can do, or send them their guide.</p>
              <a
                href={EVERY_ROLE_GUIDE.url}
                download={EVERY_ROLE_GUIDE.fileName}
                data-testid="page-help-every-role"
                className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2 text-[0.8125rem] font-semibold text-white hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Every role in one guide (PDF)
              </a>
              <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                {ALL_HELP_ROLES.map((r) => (
                  <li key={r} className="flex items-center">
                    <Link
                      href={r === role ? guidePagePath(role) : `${guidePagePath(role)}?for=${r}`}
                      onClick={onClose}
                      data-testid="page-help-role-guide"
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-slate-800 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300"
                    >
                      <BookOpen className="h-4 w-4 flex-none text-brand" aria-hidden="true" />
                      <span>Guide for {guideFor(r).audience}</span>
                    </Link>
                    <a
                      href={guideUrl(r)}
                      download={guideFileName(r)}
                      aria-label={`Download the guide for ${guideFor(r).audience} as a PDF`}
                      className="flex-none px-3 py-2 text-brand hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500" data-testid="page-help-credit">
          <span className="h-1.5 w-1.5 flex-none rounded-full bg-amber-300" aria-hidden="true" />
          <span>Made by <span className="font-serif text-[0.9375rem] font-semibold text-brand-950">{TECH_SUPPORT.name}</span>, {TECH_SUPPORT.title}</span>
        </div>
      </div>
    </>
  );
}
