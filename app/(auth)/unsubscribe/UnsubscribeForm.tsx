"use client";

/**
 * Unsubscribe from ROF news (`POST /public/unsubscribe`). Opening the link changes nothing (mail scanners open links):
 * the person presses the button. Mail clients that support one-click unsubscribe (RFC 8058) call the backend directly.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useUnsubscribe } from "@/lib/queries/subscribers";
import { unsubscribeParams } from "@/lib/subscribers/rules";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { AuthHeading } from "@/app/components/auth/AuthUi";
import { Alert } from "@/app/components/ui/feedback";

export default function UnsubscribeForm() {
  const link = unsubscribeParams(useSearchParams());
  const unsubscribe = useUnsubscribe();
  const [reason, setReason] = useState("");

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!link || unsubscribe.isPending) return;
    unsubscribe.mutate({ ...link, ...(reason.trim() && { reason: reason.trim() }) });
  }

  if (!link) {
    return (
      <div className="space-y-6">
        <AuthHeading eyebrow="ROF news" title="This unsubscribe link is incomplete" />
        <Alert tone="error">
          Part of the link is missing. Open the &quot;Unsubscribe&quot; link at the bottom of an e-mail from us again, or copy the whole
          link into your browser. You can also write to us and we will remove your address.
        </Alert>
        <Link href="/#contact" className="inline-block font-semibold text-brand hover:underline">Write to us</Link>
      </div>
    );
  }

  if (unsubscribe.isSuccess) {
    return (
      <div className="space-y-6" data-testid="unsubscribed">
        <AuthHeading eyebrow="ROF news" title="You are unsubscribed" subtitle="You will not receive Rwanda Olympiad Foundation news at this address any more." />
        <p className="text-sm text-slate-600">
          Changed your mind? <Link href="/#news" className="font-semibold text-brand hover:underline">Subscribe again</Link> on our home page.
        </p>
      </div>
    );
  }

  const err = unsubscribe.error;
  const errorText = !err
    ? null
    : isApiError(err) && err.code === "INVALID_UNSUBSCRIBE_LINK"
      ? "This unsubscribe link is not valid. Use the link in the most recent e-mail you received from us, or write to us and we will remove your address."
      : isApiError(err) && err.status === 429
        ? "Too many attempts from your network. Please try again in an hour."
        : `You were not unsubscribed. ${errorMessage(err)}`;

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Unsubscribe from ROF news">
      <AuthHeading eyebrow="ROF news" title="Unsubscribe from ROF news" subtitle="Press the button to stop receiving Rwanda Olympiad Foundation news and Olympiad announcements at this address." />
      <div>
        <label htmlFor="unsubscribe-reason" className="mb-2 block text-sm font-semibold text-slate-700">
          Why are you leaving? <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <textarea id="unsubscribe-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-200" />
      </div>
      <div aria-live="polite">{errorText && <Alert tone="error">{errorText}</Alert>}</div>
      <button type="submit" disabled={unsubscribe.isPending}
        className="inline-flex w-full items-center justify-center rounded-full bg-brand-950 px-8 py-3.5 font-bold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50">
        {unsubscribe.isPending ? "Unsubscribing…" : "Unsubscribe"}
      </button>
      {errorText && (
        <p className="text-sm text-slate-600">
          Need help? <Link href="/#contact" className="font-semibold text-brand hover:underline">Write to us</Link>.
        </p>
      )}
    </form>
  );
}
