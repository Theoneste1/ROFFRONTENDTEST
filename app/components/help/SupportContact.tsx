'use client';

/**
 * How to reach ROF support, from the official details administrators keep in the platform settings (GET /support — the
 * same as the Help and Support page and the site footer). Never a personal name or number (owner, 2026-11-28).
 * With a support phone: "Ask on WhatsApp" opens a chat with it (the first message names the page). Without one: the
 * Help and Support page, which lists whatever the settings hold.
 */
import Link from "next/link";
import { Clock, LifeBuoy, Mail, MessageCircle, Phone } from "lucide-react";
import { useSupportInfo } from "@/lib/queries/account";
import { SUPPORT_PAGE, whatsappUrl } from "@/lib/help/rules";

/** The main support button: WhatsApp with the official phone, else the Help and Support page. */
export function SupportButton({ pageTitle, className, testId, onNavigate }: { pageTitle?: string; className: string; testId?: string; onNavigate?: () => void }) {
  const info = useSupportInfo().data;
  const wa = whatsappUrl(info?.phone, pageTitle);
  return wa ? (
    <a href={wa} target="_blank" rel="noopener noreferrer" data-testid={testId} className={className}>
      <MessageCircle className="h-4 w-4" aria-hidden="true" /> Ask on WhatsApp
    </a>
  ) : (
    <Link href={SUPPORT_PAGE} onClick={onNavigate} data-testid={testId} className={className}>
      <LifeBuoy className="h-4 w-4" aria-hidden="true" /> Contact ROF support
    </Link>
  );
}

/** The official e-mail, phone and hours, one per line (only those that are set). */
export function SupportDetails({ tone = "light" }: { tone?: "light" | "dark" }) {
  const info = useSupportInfo().data;
  const row = `flex items-center gap-2 ${tone === "dark" ? "text-blue-100/85" : "text-slate-700"}`;
  const icon = `h-4 w-4 flex-none ${tone === "dark" ? "text-amber-300" : "text-brand"}`;
  const link = tone === "dark" ? "break-all hover:text-white" : "break-all font-semibold text-brand-950 hover:underline";
  if (!info?.email && !info?.phone && !info?.hours) return null;
  return (
    <ul className="space-y-1.5 text-sm" data-testid="support-details">
      {info.email && <li className={row}><Mail className={icon} aria-hidden="true" /><a href={`mailto:${info.email}`} className={link}>{info.email}</a></li>}
      {info.phone && <li className={row}><Phone className={icon} aria-hidden="true" /><a href={`tel:${info.phone.replace(/[^\d+]/g, "")}`} className={link}>{info.phone}</a></li>}
      {info.hours && <li className={row}><Clock className={icon} aria-hidden="true" /><span>{info.hours}</span></li>}
    </ul>
  );
}
