"use client";

/**
 * An administrator's view of a Teacher's, Coach's or Head Coach's banking information (capability bankingDetails,
 * users.manage): the status, what is missing or to correct, and the details with account numbers masked. "Show full
 * numbers" asks the backend for them (recorded in the audit log); they are hidden again when the page is left.
 * The rows are the role's required fields: six for a Teacher, the three personal ones for a Coach or Head Coach. A
 * coach's school details saved earlier (no longer asked) are kept and shown apart, as not required.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Landmark } from "lucide-react";
import { bankingApi } from "@/lib/api/banking";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { BANKING_FIELDS, FIELD_LABELS, PERSONAL_FIELDS, STATUS_LABEL, type BankingField } from "@/lib/accounts/banking";
import BankingStatusBadge from "./BankingStatusBadge";

const SCHOOL_FIELDS: BankingField[] = ["schoolAccountName", "schoolBankName", "schoolAccountNumber"];

/** The role's required fields (the backend's `requiredFields`; from the role when an older backend omits it). */
function rowsFor(role: string | undefined, requiredFields: BankingField[] | undefined): readonly BankingField[] {
  if (requiredFields) return requiredFields;
  return role === "MENTOR" || role === "HEAD_COACH" ? PERSONAL_FIELDS : BANKING_FIELDS;
}

function Rows({ fields, details }: { fields: readonly BankingField[]; details: Partial<Record<BankingField, string | null>> }) {
  return (
    <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {fields.map((f) => (
        <div key={f} className="min-w-0">
          <dt className="text-xs font-semibold text-gray-500">{FIELD_LABELS[f]}</dt>
          <dd className="break-words font-medium text-gray-900" data-testid={`banking-${f}`}>{details[f] || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function BankingCard({ userId, role, className = "" }: { userId: string; role?: string; className?: string }) {
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
            <>
              <Rows fields={rowsFor(role, v.requiredFields)} details={v.details} />
              {(() => {
                // School details saved earlier for a role that is no longer asked them: kept, shown apart, not required.
                const rows = rowsFor(role, v.requiredFields);
                const extra = SCHOOL_FIELDS.filter((f) => !rows.includes(f));
                if (!extra.length || !extra.some((f) => v.details?.[f])) return null;
                return (
                  <div className="mt-4 border-t border-gray-100 pt-3" data-testid="banking-legacy-school">
                    <p className="text-xs font-semibold text-gray-600">School details saved earlier (not required for this role)</p>
                    <Rows fields={extra} details={v.details} />
                  </div>
                );
              })()}
            </>
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
