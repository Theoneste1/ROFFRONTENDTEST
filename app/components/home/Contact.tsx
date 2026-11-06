"use client";

/**
 * Contact (`POST /public/contact`). The message is stored by the backend and,
 * when a support e-mail is configured, an e-mail notice is queued to ROF. The
 * page says the message was *received*; it never claims an e-mail was
 * delivered. A hidden honeypot field catches bots. Contact details come from
 * `GET /support`. `?subject=teacher` (the "Join as a Teacher" buttons)
 * prefills the subject, because school teachers have no accounts yet.
 */
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Clock, ExternalLink, Globe, Mail, Phone, Send } from "lucide-react";
import { useSendContact, useSupportInfo } from "@/lib/queries/account";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { SITE } from "@/lib/site/content";
import { Alert } from "@/app/components/ui/feedback";
import SocialLinks from "./SocialLinks";
import Reveal from "./Reveal";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Field = "name" | "email" | "subject" | "message";
const TEACHER_SUBJECT = "Teacher: connect my school with ROF";
/** Backend field names → form fields. */
const SERVER_FIELD: Record<string, Field> = { fullName: "name", email: "email", subject: "subject", message: "message" };
type Errors = Partial<Record<Field, string>>;

function safeUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default function Contact() {
  const support = useSupportInfo();
  const info = support.data;
  const to = info?.email ?? null;
  const website = safeUrl(SITE.website);
  const helpUrl = safeUrl(info?.helpUrl);

  const send = useSendContact();
  const intent = useSearchParams().get("subject");
  const [form, setForm] = useState<Record<Field, string>>({ name: "", email: "", subject: intent === "teacher" ? TEACHER_SUBJECT : "", message: "" });
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  // A "Join as a Teacher" link followed while already on the page: prefill once.
  const [seenIntent, setSeenIntent] = useState(intent);
  if (intent !== seenIntent) {
    setSeenIntent(intent);
    if (intent === "teacher" && !form.subject) setForm((f) => ({ ...f, subject: TEACHER_SUBJECT }));
  }
  const set = (k: Field) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSentTo(null);
    if (send.isError) send.reset();
  };

  function validate(): Errors {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = "Please enter your full name.";
    if (!EMAIL.test(form.email.trim())) e.email = "Please enter a valid e-mail address.";
    if (form.subject.trim().length < 3) e.subject = "Please add a short subject (at least 3 characters).";
    if (form.message.trim().length < 10) e.message = "Please write a message of at least 10 characters.";
    return e;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (send.isPending) return;
    const e = validate();
    setErrors(e);
    setSentTo(null);
    if (Object.keys(e).length) return;
    send.mutate(
      { fullName: form.name.trim(), email: form.email.trim(), subject: form.subject.trim(), message: form.message.trim(), ...(honeypot ? { website: honeypot } : {}) },
      {
        onSuccess: () => {
          setSentTo(form.email.trim());
          setForm({ name: "", email: "", subject: "", message: "" });
        },
        onError: (err) => {
          const server = fieldErrors(err, Object.keys(SERVER_FIELD));
          setErrors(Object.fromEntries(Object.entries(server).map(([k, v]) => [SERVER_FIELD[k], v])));
        },
      },
    );
  }

  const sendError = send.error;
  const serverFieldErrors = Object.keys(fieldErrors(sendError, Object.keys(SERVER_FIELD))).length > 0;
  const sendErrorText =
    !sendError || serverFieldErrors
      ? null
      : isApiError(sendError) && sendError.code === "DUPLICATE_MESSAGE"
        ? "We have already received this message. There is no need to send it again."
        : isApiError(sendError) && (sendError.code === "CONTACT_LIMIT" || sendError.status === 429)
          ? "Your message was not sent: too many messages were sent recently. Please try again later."
          : `Your message was not sent. ${errorMessage(sendError)}`;

  const input = (bad?: string) =>
    `w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${bad ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:border-[#00428c] focus:ring-blue-200"}`;

  return (
    <section id="contact" className="bg-gradient-to-br from-blue-50 via-white to-amber-50/60 py-20 sm:py-28" aria-labelledby="contact-title">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
        <Reveal className="lg:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#00428c]">Contact us</p>
          <h2 id="contact-title" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Let&apos;s talk</h2>
          <p className="mt-4 text-lg text-slate-600">
            Questions about the platform, Olympiad programmes or getting your school involved? Write to the {SITE.organisation}.
          </p>

          <ul className="mt-8 space-y-5" aria-label="Contact details">
            {to && (
              <li className="flex items-start gap-4">
                <span className="rounded-xl bg-[#001E4E] p-3 text-white"><Mail className="h-5 w-5" aria-hidden="true" /></span>
                <span><span className="block text-sm font-semibold text-slate-500">E-mail</span><a href={`mailto:${to}`} className="font-semibold text-[#00428c] hover:underline">{to}</a></span>
              </li>
            )}
            {info?.phone && (
              <li className="flex items-start gap-4">
                <span className="rounded-xl bg-[#001E4E] p-3 text-white"><Phone className="h-5 w-5" aria-hidden="true" /></span>
                <span><span className="block text-sm font-semibold text-slate-500">Phone</span><a href={`tel:${info.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-[#00428c] hover:underline">{info.phone}</a></span>
              </li>
            )}
            {info?.hours && (
              <li className="flex items-start gap-4">
                <span className="rounded-xl bg-[#001E4E] p-3 text-white"><Clock className="h-5 w-5" aria-hidden="true" /></span>
                <span><span className="block text-sm font-semibold text-slate-500">Hours</span><span className="font-semibold text-slate-800">{info.hours}</span></span>
              </li>
            )}
            {(website || helpUrl) && (
              <li className="flex items-start gap-4">
                <span className="rounded-xl bg-[#001E4E] p-3 text-white"><Globe className="h-5 w-5" aria-hidden="true" /></span>
                <span>
                  <span className="block text-sm font-semibold text-slate-500">Website</span>
                  <a href={(website ?? helpUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#00428c] hover:underline">
                    {(website ?? helpUrl)!.replace(/^https?:\/\//, "").replace(/\/$/, "")} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </span>
              </li>
            )}
          </ul>
          {support.isSuccess && !to && !info?.phone && (
            <p className="mt-6 rounded-xl bg-white/80 p-4 text-sm text-slate-600 ring-1 ring-slate-200" data-testid="contact-not-configured">
              Contact details haven&apos;t been published yet. Visit the <a href="/support" className="font-semibold text-[#00428c] hover:underline">Help and support</a> page for updates.
            </p>
          )}
          <div className="mt-8">
            <SocialLinks tone="light" />
          </div>
        </Reveal>

        <Reveal delayClass="delay-150" className="lg:col-span-3">
          <form onSubmit={onSubmit} noValidate className="relative rounded-3xl bg-white p-6 shadow-xl shadow-blue-900/5 ring-1 ring-slate-200 sm:p-10" aria-describedby="contact-how">
            <div className="grid gap-5 sm:grid-cols-2">
              {(["name", "email"] as const).map((k) => (
                <div key={k}>
                  <label htmlFor={`contact-${k}`} className="mb-2 block text-sm font-semibold text-slate-700">
                    {k === "name" ? "Full name" : "E-mail address"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    id={`contact-${k}`}
                    name={k}
                    type={k === "email" ? "email" : "text"}
                    autoComplete={k === "email" ? "email" : "name"}
                    required
                    maxLength={k === "email" ? 254 : 100}
                    value={form[k]}
                    onChange={(e) => set(k)(e.target.value)}
                    aria-invalid={errors[k] ? true : undefined}
                    aria-describedby={errors[k] ? `contact-${k}-error` : undefined}
                    className={input(errors[k])}
                  />
                  {errors[k] && <p id={`contact-${k}-error`} className="mt-1.5 text-sm text-red-600">{errors[k]}</p>}
                </div>
              ))}
            </div>
            <div className="mt-5">
              <label htmlFor="contact-subject" className="mb-2 block text-sm font-semibold text-slate-700">Subject <span className="text-red-500">*</span></label>
              <input id="contact-subject" name="subject" required maxLength={150} value={form.subject} onChange={(e) => set("subject")(e.target.value)} aria-invalid={errors.subject ? true : undefined} aria-describedby={errors.subject ? "contact-subject-error" : undefined} className={input(errors.subject)} />
              {errors.subject && <p id="contact-subject-error" className="mt-1.5 text-sm text-red-600">{errors.subject}</p>}
            </div>
            <div className="mt-5">
              <label htmlFor="contact-message" className="mb-2 block text-sm font-semibold text-slate-700">Message <span className="text-red-500">*</span></label>
              <textarea id="contact-message" name="message" required rows={6} maxLength={5000} value={form.message} onChange={(e) => set("message")(e.target.value)} aria-invalid={errors.message ? true : undefined} aria-describedby={errors.message ? "contact-message-error" : undefined} className={`${input(errors.message)} resize-y`} />
              {errors.message && <p id="contact-message-error" className="mt-1.5 text-sm text-red-600">{errors.message}</p>}
            </div>

            {/* Honeypot: invisible to people and assistive technology; bots tend to fill it. */}
            <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="contact-website">Website</label>
              <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            <div className="mt-6 space-y-4" aria-live="polite">
              {sentTo && (
                <Alert tone="success">
                  Thank you — your message has been received by the {SITE.organisation}. We will reply to {sentTo}.
                </Alert>
              )}
              {sendErrorText && <Alert tone="error">{sendErrorText}</Alert>}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p id="contact-how" className="text-sm text-slate-500">
                We use your details only to reply to your message.
              </p>
              <button
                type="submit"
                disabled={send.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#001E4E] px-8 py-3.5 font-bold text-white transition hover:bg-[#00428c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" /> {send.isPending ? "Sending…" : "Send Message"}
              </button>
            </div>
          </form>
        </Reveal>
      </div>
    </section>
  );
}
