"use client";

import { useState } from "react";
import Link from "next/link";
import { Gauge } from "lucide-react";
import { useEmailUsage, useRecoverQuotaFailures } from "@/lib/queries/admin-ops";
import {
  DRY_RUN_NOTE, dailyLine, discardedLine, failedLine, monthlyLine, pausedText, recoverConfirmText, recoverLabel, recoverOutcome,
} from "@/lib/admin-ops/email-budget";
import { Notice, btnSecondary, linkBtn } from "../components/adminUi";

/**
 * "Sending today" (capability emailBudget): how much of the Resend Free plan budget is used, when the next e-mail can go,
 * what is waiting, and the failed / dropped e-mails. Shown at the top of the admin E-mail page.
 */
export default function SendingTodayPanel() {
  const usage = useEmailUsage();
  const recover = useRecoverQuotaFailures();
  const [message, setMessage] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);

  if (usage.isPending || usage.isError) return null;
  const u = usage.data;
  const paused = pausedText(u);
  const recoverText = recoverLabel(u);

  async function onRecover() {
    if (!window.confirm(recoverConfirmText(u.recoverableQuotaFailures))) return;
    setMessage(null);
    try {
      setMessage(recoverOutcome(await recover.mutateAsync(), null));
    } catch (e) {
      setMessage(recoverOutcome(null, e));
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="sending-today" data-testid="sending-today">
      <h2 id="sending-today" className="flex items-center gap-2 text-sm font-bold text-gray-900">
        <Gauge className="h-4 w-4 text-[#00428C]" aria-hidden="true" /> Sending today
      </h2>
      {paused && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800" role="status" data-testid="sending-paused">
          {paused}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-800" data-testid="sending-daily">{dailyLine(u)}</p>
      <p className="mt-1 text-xs text-gray-600" data-testid="sending-monthly">{monthlyLine(u)}</p>
      {u.dryRun && <p className="mt-1 text-xs text-gray-600">{DRY_RUN_NOTE}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link href="/admin/email/failed" className={linkBtn} data-testid="sending-failed">{failedLine(u)}</Link>
        <Link href="/admin/email/failed?status=DISCARDED" className={linkBtn} data-testid="sending-discarded">{discardedLine(u)}</Link>
      </div>
      {u.discarded.reasons.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-gray-600" data-testid="sending-discard-reasons">
          {u.discarded.reasons.map((r) => (
            <li key={r.reason}>
              {r.reason} ({r.count})
            </li>
          ))}
        </ul>
      )}
      {recoverText && (
        <button type="button" className={`${btnSecondary} mt-3`} disabled={recover.isPending} onClick={() => void onRecover()} data-testid="sending-recover">
          {recoverText}
        </button>
      )}
      {message && (
        <div className="mt-3">
          <Notice tone={message.tone} onClose={() => setMessage(null)}>
            {message.text}
          </Notice>
        </div>
      )}
    </section>
  );
}
