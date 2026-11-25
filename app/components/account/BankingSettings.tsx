"use client";

/**
 * "Banking information" in a Teacher's, Coach's or Head Coach's own Settings (owner 2026-11-25): the saved details
 * (account numbers masked until "Show") and "Edit", which opens the same form as the first-sign-in step, with the same
 * rules, as often as the owner wants (PUT /me/banking). Shown only when the backend lists `bankingDetails`.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Landmark, Pencil } from "lucide-react";
import { bankingApi } from "@/lib/api/banking";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { BANKING_ROLES, FIELD_LABELS, maskNumber, requiredFieldsOf, rulesFor, STATUS_LABEL } from "@/lib/accounts/banking";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import { BankingForm } from "@/app/components/auth/BankingStep";
import { Section } from "./Section";

export default function BankingSettings({ role, firstName }: { role: string; firstName: string }) {
  const { detection } = useBackendCapabilities();
  if (!(BANKING_ROLES as readonly string[]).includes(role) || !hasFeature(detection, "bankingDetails")) return null;
  return <BankingSettingsCard role={role} firstName={firstName} />;
}

function BankingSettingsCard({ role, firstName }: { role: string; firstName: string }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["me", "banking"], queryFn: bankingApi.mine });
  const [editing, setEditing] = useState(false);
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const v = q.data;
  const rules = v?.rules ?? rulesFor(role);
  return (
    <Section
      title="Banking information"
      icon={<Landmark className="w-5 h-5" />}
      description="Where ROF pays you. Visible only to you and to authorised ROF administrators. You can update it at any time."
    >
      <div data-testid="settings-banking">
        {q.isPending ? (
          <LoadingBlock label="Loading your banking information…" />
        ) : q.isError || !v ? (
          <ErrorState error={q.error} title="Couldn't load your banking information" onRetry={() => q.refetch()} />
        ) : editing ? (
          <BankingForm
            variant="edit"
            firstName={firstName}
            role={role}
            view={v}
            onCancel={() => setEditing(false)}
            onSaved={async () => {
              setEditing(false);
              setNotice("Your banking information has been saved.");
              await q.refetch();
              await queryClient.invalidateQueries({ queryKey: queryKeys.me.all });
            }}
          />
        ) : (
          <>
            {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}
            {v.status && v.status !== "COMPLETE" && (
              <div className="mb-4"><Alert tone="info">Status: {STATUS_LABEL[v.status]}. Use Edit to complete it.</Alert></div>
            )}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {requiredFieldsOf(rules).map((f) => {
                const value = v.details?.[f] ?? null;
                return (
                  <div key={f} className="min-w-0">
                    <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{FIELD_LABELS[f]}</dt>
                    <dd className="mt-0.5 break-words text-gray-800" data-testid={`settings-banking-${f}`}>
                      {f.endsWith("Number") && !show ? maskNumber(value) : value || "—"}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={() => { setNotice(null); setEditing(true); }} data-testid="settings-banking-edit">
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
              </Button>
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#00428C] hover:underline"
                data-testid="settings-banking-show"
              >
                {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                {show ? "Hide account numbers" : "Show account numbers"}
              </button>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
