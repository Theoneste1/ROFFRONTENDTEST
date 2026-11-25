"use client";

/**
 * An administrator's view of a Teacher's, Coach's or Head Coach's banking information (capability bankingDetails,
 * users.manage): the status, what is missing or to correct, and the details with account numbers masked. "Show full
 * numbers" asks the backend for them (recorded in the audit log); they are hidden again when the page is left.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Landmark } from "lucide-react";
import { bankingApi } from "@/lib/api/banking";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { FIELD_LABELS, STATUS_LABEL, type BankingField } from "@/lib/accounts/banking";
import BankingStatusBadge from "./BankingStatusBadge";

const ROWS: BankingField[] = ["personalAccountName", "personalBankName", "personalAccountNumber", "schoolAccountName", "schoolBankName", "schoolAccountNumber"];

export default function BankingCard({ userId, className = "" }: { userId: string; className?: string }) {
  const [reveal, setReveal] = useState(false);
  const q = useQuery({ queryKey: ["admin", "banking", userId, reveal], queryFn: () => bankingApi.ofUser(userId, reveal), staleTime: reveal ? 0 : 30_000, gcTime: reveal ? 0 : undefined });
  const v = q.data;
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-6 shadow-sm ${className}`} data-testid="banking-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Landmark className="h-4 w-4 text-[#00428C]" aria-hidden="true" /> Banking information
        </h2>
        {v?.status && <BankingStatusBadge banking={{ status: v.status, missing: v.missing, invalid: v.invalid }} />}
      </div>
      {q.isPending ? (
        <LoadingBlock label="Loading…" />
      ) : q.isError ? (
        <ErrorState error={q.error} title="Couldn't load the banking information" onRetry={() => q.refetch()} />
      ) : !v?.required ? (
        <p className="mt-3 text-sm text-gray-600">Not asked of this role.</p>
      ) : (
        <>
          {(v.missingLabels.length > 0 || v.invalidLabels.length > 0) && (
            <p className="mt-3 text-sm text-gray-700" data-testid="banking-missing">
              {v.missingLabels.length > 0 && <>Missing: {v.missingLabels.join(", ")}. </>}
              {v.invalidLabels.length > 0 && <>To correct: {v.invalidLabels.join(", ")}.</>}
            </p>
          )}
          {v.details ? (
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {ROWS.map((f) => (
                <div key={f} className="min-w-0">
                  <dt className="text-xs font-semibold text-gray-500">{FIELD_LABELS[f]}</dt>
                  <dd className="break-words font-medium text-gray-900" data-testid={`banking-${f}`}>{v.details?.[f] || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-gray-600">{STATUS_LABEL.NOT_STARTED}: nothing given yet.</p>
          )}
          {v.details && (
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#00428C] hover:underline"
              data-testid="banking-reveal"
            >
              {reveal ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {reveal ? "Hide full account numbers" : "Show full account numbers (recorded in the audit log)"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
