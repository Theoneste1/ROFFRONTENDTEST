/**
 * A closed public form, as the administrators configured it (capability formAvailability): the closed message,
 * when it opens (Kigali time), instructions, and the contact e-mail and support link. Texts are shown as plain text.
 */
import type { ReactNode } from "react";
import { Mail, ExternalLink, CalendarClock } from "lucide-react";
import { Alert } from "@/app/components/ui/feedback";
import type { ClosedFormNotice as Notice } from "@/lib/forms/closed-form";

export default function ClosedFormNotice({ notice, children }: { notice: Notice; children?: ReactNode }) {
  return (
    <div className="space-y-4" data-testid="closed-form-notice">
      <Alert tone="info">
        <span className="whitespace-pre-line" data-testid="closed-form-message">{notice.message}</span>
      </Alert>
      {notice.opensAtText && (
        <p className="flex items-center gap-2 text-sm text-slate-700" data-testid="closed-form-opens">
          <CalendarClock className="h-4 w-4 text-slate-600" aria-hidden="true" /> Opens on {notice.opensAtText}.
        </p>
      )}
      {notice.instructions && (
        <p className="whitespace-pre-line text-sm text-slate-700" data-testid="closed-form-instructions">{notice.instructions}</p>
      )}
      {(notice.contactEmail || notice.supportUrl) && (
        <ul className="space-y-1.5 text-sm" data-testid="closed-form-contact">
          {notice.contactEmail && (
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <a href={`mailto:${notice.contactEmail}`} className="font-medium text-brand hover:underline">{notice.contactEmail}</a>
            </li>
          )}
          {notice.supportUrl && (
            <li className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <a href={notice.supportUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
                More information
              </a>
            </li>
          )}
        </ul>
      )}
      {children}
    </div>
  );
}
