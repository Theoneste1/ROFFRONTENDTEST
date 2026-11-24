"use client";

/**
 * "Get ROF news" (`POST /public/subscribe`, capability `subscribers`): anyone — parents, schools, the public — leaves an
 * e-mail address (name and subjects optional) to receive Rwanda Olympiad Foundation news and Olympiad announcements.
 * Shown only when the backend advertises the feature. The answer is the same whether the address is new or already on
 * the list, so the page never says which. A hidden honeypot field catches bots.
 *
 * Owner 2026-11-24: no section on the home page; the footer's "Get ROF news by e-mail" link opens this form in a
 * dialog (<SubscribeDialog>), and so does an address ending in #news (the unsubscribe page's "Subscribe again").
 */
import { useState, type FormEvent } from "react";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useSubscribe } from "@/lib/queries/subscribers";
import { SUBJECTS, subscribeBody, subscribeProblems, subscribersSupported, type OlympiadSubject } from "@/lib/subscribers/rules";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { Alert } from "@/app/components/ui/feedback";
import { Modal } from "@/app/admin/components/adminUi";

/** The footer link's dialog: the subscription form, then the thank-you message. */
export function SubscribeDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Get ROF news" onClose={onClose} wide>
      <div className="px-6 pb-6 pt-2">
        <SubscribeForm onClose={onClose} />
      </div>
    </Modal>
  );
}

/** The subscription form (inside the dialog). */
export function SubscribeForm({ onClose }: { onClose?: () => void }) {
  const { detection } = useBackendCapabilities();
  const subscribe = useSubscribe();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<OlympiadSubject[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [problems, setProblems] = useState<Partial<Record<"name" | "email", string>>>({});
  const [done, setDone] = useState<string | null>(null);

  if (!subscribersSupported(detection)) return null;

  function toggle(s: OlympiadSubject) {
    setInterests((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (subscribe.isPending) return;
    const form = { name, email, interests };
    const found = subscribeProblems(form);
    setProblems(found);
    setDone(null);
    if (Object.keys(found).length) return;
    subscribe.mutate(subscribeBody(form, honeypot), {
      onSuccess: () => {
        setDone(email.trim());
        setName("");
        setEmail("");
        setInterests([]);
      },
    });
  }

  const err = subscribe.error;
  const errorText = !err
    ? null
    : isApiError(err) && err.status === 429
      ? "You were not subscribed: too many requests came from your network. Please try again in an hour."
      : `You were not subscribed. ${errorMessage(err)}`;

  const input = (bad?: string) =>
    `w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${bad ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:border-brand focus:ring-brand-200"}`;

  return (
    <div data-testid="subscribe-dialog">
          <p className="text-slate-600">
            News from the Rwanda Olympiad Foundation and Olympiad announcements, by e-mail. For parents, schools, students and
            anyone interested. Every e-mail has a link to unsubscribe.
          </p>
          <form onSubmit={onSubmit} noValidate className="relative mt-6" aria-label="Subscribe to ROF news" data-testid="subscribe-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="news-name" className="mb-2 block text-sm font-semibold text-slate-700">
                  Name <span className="font-normal text-slate-500">(optional)</span>
                </label>
                <input id="news-name" name="name" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
                  aria-invalid={problems.name ? true : undefined} aria-describedby={problems.name ? "news-name-error" : undefined} className={input(problems.name)} />
                {problems.name && <p id="news-name-error" className="mt-1.5 text-sm text-red-600">{problems.name}</p>}
              </div>
              <div>
                <label htmlFor="news-email" className="mb-2 block text-sm font-semibold text-slate-700">
                  E-mail address <span className="text-amber-600">*</span>
                </label>
                <input id="news-email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={problems.email ? true : undefined} aria-describedby={problems.email ? "news-email-error" : undefined} className={input(problems.email)} />
                {problems.email && <p id="news-email-error" className="mt-1.5 text-sm text-red-600">{problems.email}</p>}
              </div>
            </div>
            <fieldset className="mt-5">
              <legend className="mb-2 text-sm font-semibold text-slate-700">
                Subjects you are interested in <span className="font-normal text-slate-500">(none chosen = all)</span>
              </legend>
              <div className="flex flex-wrap gap-3">
                {SUBJECTS.map((s) => (
                  <label key={s.value} className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 has-[:checked]:ring-2 has-[:checked]:ring-brand">
                    <input type="checkbox" className="h-4 w-4 accent-brand" checked={interests.includes(s.value)} onChange={() => toggle(s.value)} />
                    {s.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Honeypot: invisible to people and assistive technology; bots tend to fill it. */}
            <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="news-website">Website</label>
              <input id="news-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            <div className="mt-6 space-y-4" aria-live="polite">
              {done && (
                <Alert tone="success">
                  Thank you. You will receive Rwanda Olympiad Foundation news at {done}. Every e-mail has a link to unsubscribe.
                </Alert>
              )}
              {errorText && <Alert tone="error">{errorText}</Alert>}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">We use your address only to send ROF news. You can unsubscribe at any time.</p>
              {done && onClose ? (
                <button type="button" onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-950 px-8 py-3.5 font-bold text-white transition hover:bg-brand">
                  Close
                </button>
              ) : (
              <button type="submit" disabled={subscribe.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-950 px-8 py-3.5 font-bold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50">
                {subscribe.isPending ? "Subscribing…" : "Subscribe"}
              </button>
              )}
            </div>
          </form>
    </div>
  );
}
