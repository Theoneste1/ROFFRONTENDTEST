"use client";

/**
 * Help and support (`GET /support`, public). Shows only the contact details the
 * administrators configured under platform settings. The backend has no
 * support-request endpoint, so there is no form here.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Clock, ExternalLink, Mail, MessageSquare, Phone } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { portalHome } from "@/lib/auth/roles";
import { useSupportInfo } from "@/lib/queries/account";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";

/** Only http(s) links are shown (the value is admin-entered text). */
function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <div className="text-sm text-slate-800 break-words">{children}</div>
      </div>
    </li>
  );
}

export default function SupportInfo() {
  const session = useSession();
  const info = useSupportInfo();
  const role = session.status === "authenticated" ? session.role : null;
  const back = role ? { href: portalHome(role), label: "Back to my dashboard" } : { href: "/login", label: "Back to sign in" };

  if (info.isPending) return <LoadingBlock label="Loading support details…" />;
  if (info.isError) return <ErrorState error={info.error} title="Couldn't load support details" onRetry={() => info.refetch()} />;

  const s = info.data;
  const helpUrl = safeUrl(s.helpUrl);
  const hasContact = !!(s.email || s.phone || helpUrl);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Help and support</h1>
        <p className="mt-1 text-sm text-slate-500">{s.platformName ?? "ROF Learning Platform"}</p>
      </div>

      {s.message && <p className="text-sm text-slate-700 whitespace-pre-line">{s.message}</p>}

      {hasContact || s.hours ? (
        <ul className="space-y-4" data-testid="support-contacts">
          {s.email && (
            <Row icon={<Mail className="h-4 w-4" />} label="E-mail">
              <a href={`mailto:${s.email}`} className="font-medium text-[#2B2BB2] hover:underline">
                {s.email}
              </a>
            </Row>
          )}
          {s.phone && (
            <Row icon={<Phone className="h-4 w-4" />} label="Phone">
              <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-[#2B2BB2] hover:underline">
                {s.phone}
              </a>
            </Row>
          )}
          {s.hours && (
            <Row icon={<Clock className="h-4 w-4" />} label="Hours">
              {s.hours}
            </Row>
          )}
          {helpUrl && (
            <Row icon={<ExternalLink className="h-4 w-4" />} label="Help centre">
              <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#2B2BB2] hover:underline">
                {helpUrl}
              </a>
            </Row>
          )}
        </ul>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600" data-testid="support-not-configured">
          Support contact details haven&apos;t been published yet.
          {role === "ADMIN" ? (
            <>
              {" "}
              You can add them under{" "}
              <Link href="/admin/settings" className="font-semibold text-[#2B2BB2] hover:underline">
                platform settings
              </Link>{" "}
              (support e-mail, phone, hours, help link and message).
            </>
          ) : (
            " Please ask your mentor or your school's Olympiad contact."
          )}
        </div>
      )}

      {role && role !== "ADMIN" && (
        <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-slate-700">
          <MessageSquare className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
          <p>
            Questions about a course or an assignment? Ask in its <span className="font-semibold">Discussion</span> tab, where{" "}
            {role === "STUDENT" ? "your mentors and classmates" : "your students"} can answer.
          </p>
        </div>
      )}

      {session.status !== "loading" && (
        <Link href={back.href} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
    </div>
  );
}
