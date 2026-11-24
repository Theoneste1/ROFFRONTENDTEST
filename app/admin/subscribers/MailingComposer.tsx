"use client";

/**
 * "Send an update": subject, message (plain text; blank lines separate paragraphs), audience (interests, kinds,
 * countries; nothing chosen = everyone subscribed), the number of recipients, a test to yourself, and sending after a
 * confirmation. The backend waits two minutes before sending, so a mistake can still be cancelled under "Mailings sent".
 */
import { useMemo, useState } from "react";
import { Send, X } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { useAudiencePreview, useSendMailing, useSendTestMailing } from "@/lib/queries/subscribers";
import {
  KINDS, SUBJECTS, audienceSummary, cleanAudience, mailingProblems, newMailingKey, type OlympiadSubject, type SubscriberKind,
} from "@/lib/subscribers/rules";
import { countryName, countryOptions } from "@/lib/schools/countries";
import { Alert } from "@/app/components/ui/feedback";
import { Card, ConfirmDialog, btnPrimary, btnSecondary } from "../components/adminUi";

const inputCls = "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
const labelCls = "block text-sm font-semibold text-slate-700 mb-1";
const COUNTRIES = countryOptions();

function toggle<T>(xs: T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

export default function MailingComposer({ onSent }: { onSent: (text: string) => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [interests, setInterests] = useState<OlympiadSubject[]>([]);
  const [kinds, setKinds] = useState<SubscriberKind[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [problems, setProblems] = useState<Partial<Record<"subject" | "body", string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [testNote, setTestNote] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // One key per composed mailing: a double click, or a retry after a lost answer, sends it once.
  const [key, setKey] = useState(() => newMailingKey());
  const audience = useMemo(() => cleanAudience({ interests, kinds, countries }), [interests, kinds, countries]);
  const preview = useAudiencePreview(audience);
  const send = useSendMailing();
  const test = useSendTestMailing();
  const recipients = preview.data?.recipients;

  function checked(): boolean {
    const p = mailingProblems({ subject, body });
    setProblems(p);
    return Object.keys(p).length === 0;
  }

  async function sendTest() {
    setTestNote(null);
    if (!checked()) return;
    try {
      const r = await test.mutateAsync({ subject: subject.trim(), body });
      setTestNote({ tone: "success", text: `A test was queued to ${r.sentTo}. It arrives within a minute or two, with "[Test]" before the subject.` });
    } catch (err) {
      setTestNote({ tone: "error", text: `The test was not sent. ${errorMessage(err)}` });
    }
  }

  return (
    <Card className="p-6 space-y-5">
      <div>
        <label htmlFor="mailing-subject" className={labelCls}>Subject <span className="text-amber-600">*</span></label>
        <input id="mailing-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={inputCls}
          aria-invalid={problems.subject ? true : undefined} aria-describedby={problems.subject ? "mailing-subject-error" : undefined} />
        {problems.subject && <p id="mailing-subject-error" className="mt-1 text-xs text-red-600">{problems.subject}</p>}
      </div>
      <div>
        <label htmlFor="mailing-body" className={labelCls}>Message <span className="text-amber-600">*</span></label>
        <textarea id="mailing-body" value={body} onChange={(e) => setBody(e.target.value)} rows={10} maxLength={20_000} className={`${inputCls} resize-y`}
          aria-invalid={problems.body ? true : undefined} aria-describedby={`mailing-body-help${problems.body ? " mailing-body-error" : ""}`} />
        <p id="mailing-body-help" className="mt-1 text-xs text-gray-500">
          Plain text. Leave a blank line between paragraphs. Each e-mail starts with &quot;Hello &lt;first name&gt;,&quot; and ends with the person&apos;s own unsubscribe link.
        </p>
        {problems.body && <p id="mailing-body-error" className="mt-1 text-xs text-red-600">{problems.body}</p>}
      </div>

      <fieldset className="space-y-3">
        <legend className={labelCls}>Who receives it</legend>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-gray-600 w-20">Interests</span>
          {SUBJECTS.map((s) => (
            <label key={s.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="accent-brand" checked={interests.includes(s.value)} onChange={() => setInterests((xs) => toggle(xs, s.value))} />
              {s.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-gray-600 w-20">Kinds</span>
          {KINDS.map((k) => (
            <label key={k.value} className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="accent-brand" checked={kinds.includes(k.value)} onChange={() => setKinds((xs) => toggle(xs, k.value))} />
              {k.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="mailing-country" className="text-xs font-semibold text-gray-600 w-20">Countries</label>
          <select id="mailing-country" value="" onChange={(e) => e.target.value && setCountries((xs) => (xs.includes(e.target.value) ? xs : [...xs, e.target.value]))}
            className="bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs font-medium text-gray-700">
            <option value="">Add a country…</option>
            {COUNTRIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {countries.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand">
              {countryName(c)}
              <button type="button" aria-label={`Remove ${countryName(c)}`} onClick={() => setCountries((xs) => xs.filter((x) => x !== c))}><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-500">Nothing chosen = everyone subscribed. People who chose no interest receive every subject&apos;s news. Unsubscribed people never receive anything.</p>
        <p className="text-sm text-gray-800" aria-live="polite" data-testid="mailing-recipients">
          {audienceSummary(audience, countryName)}:{" "}
          <strong>{preview.isError ? "could not be counted" : recipients === undefined ? "counting…" : `${recipients.toLocaleString()} recipient${recipients === 1 ? "" : "s"}`}</strong>
        </p>
      </fieldset>

      {testNote && <Alert tone={testNote.tone}>{testNote.text}</Alert>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" className={btnSecondary} onClick={sendTest} disabled={test.isPending}>{test.isPending ? "Sending the test…" : "Send a test to me"}</button>
        <button type="button" className={btnPrimary} disabled={!recipients || send.isPending}
          title={recipients === 0 ? "Nobody matches this audience" : undefined}
          onClick={() => { if (checked()) setConfirming(true); }}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> Send to {recipients?.toLocaleString() ?? "…"} subscriber{recipients === 1 ? "" : "s"}
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={`Send "${subject.trim()}"?`}
          body={
            <>
              It goes to <strong>{recipients?.toLocaleString()}</strong> subscriber{recipients === 1 ? "" : "s"} ({audienceSummary(audience, countryName).toLowerCase()}). Sending starts in
              two minutes; until then you can cancel it under &quot;Mailings sent&quot;.
            </>
          }
          confirmLabel="Send"
          onConfirm={async () => {
            const m = await send.mutateAsync({ subject: subject.trim(), body, audience, idempotencyKey: key });
            setSubject("");
            setBody("");
            setInterests([]);
            setKinds([]);
            setCountries([]);
            setKey(newMailingKey());
            onSent(`"${m.subject}" is queued for ${m.recipientCount.toLocaleString()} subscriber${m.recipientCount === 1 ? "" : "s"}. Sending starts in two minutes.`);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </Card>
  );
}
