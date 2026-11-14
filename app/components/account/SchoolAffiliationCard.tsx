"use client";

/**
 * The student's school and its verification (`GET /me/school-affiliation`), and
 * asking for another one (`POST /me/school-affiliation`). Students only, and only
 * when the backend advertises `schoolAffiliations`. A new claim is PENDING until
 * an Administrator verifies it; teachers see a student only once it is VERIFIED.
 * A student may ask for a different school while a claim is pending (the new
 * claim replaces it); asking again for the same school is refused
 * (CLAIM_ALREADY_PENDING / ALREADY_VERIFIED — checked here for a directory school,
 * and always by the backend). The backend also enforces 3 requests a day and a
 * 7-day cooldown after a rejection.
 */
import { useState, type FormEvent } from "react";
import { School } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { myAffiliationApi, type AffiliationStatus } from "@/lib/api/accounts";
import { sameClaimedSchool } from "@/lib/accounts/school-claim";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { hasFeature } from "@/lib/api/capabilities";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import {
  countryLabel,
  SCHOOL_CLAIM_ERRORS,
  SCHOOL_CLAIM_SERVER_FIELDS,
  schoolClaimPayload,
  validateSchoolClaim,
  type SchoolClaimDraft,
  type SchoolClaimField,
} from "@/lib/accounts/school-claim";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Button } from "@/app/components/ui/form";
import SchoolClaimFields, { emptyDraft } from "./SchoolClaimFields";
import { Section } from "./Section";

const STATUS: Record<AffiliationStatus, { label: string; cls: string; text: string }> = {
  PENDING: { label: "Waiting for verification", cls: "bg-amber-50 text-amber-700", text: "An administrator will check this school." },
  VERIFIED: { label: "Verified", cls: "bg-emerald-50 text-emerald-700", text: "An administrator confirmed this school." },
  REJECTED: { label: "Not confirmed", cls: "bg-red-50 text-red-700", text: "An administrator could not confirm this school." },
  REVOKED: { label: "Verification withdrawn", cls: "bg-gray-100 text-gray-600", text: "An administrator withdrew the verification of this school." },
};

export default function SchoolAffiliationCard() {
  const enabled = hasFeature(useBackendCapabilities().detection, "schoolAffiliations");
  const qc = useQueryClient();
  const mine = useQuery({ queryKey: queryKeys.me.schoolAffiliation(), queryFn: myAffiliationApi.get, enabled });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SchoolClaimDraft>(() => emptyDraft("directory"));
  const [errors, setErrors] = useState<Partial<Record<SchoolClaimField, string>>>({});
  const [sent, setSent] = useState(false);
  const claim = useMutation({
    mutationFn: () => myAffiliationApi.claim(schoolClaimPayload(draft)),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.me.schoolAffiliation(), data);
      void qc.invalidateQueries({ queryKey: queryKeys.me.all });
      setEditing(false);
      setSent(true);
    },
    onError: (err) => {
      const server = fieldErrors(err, Object.keys(SCHOOL_CLAIM_SERVER_FIELDS));
      setErrors(Object.fromEntries(Object.entries(server).map(([k, m]) => [SCHOOL_CLAIM_SERVER_FIELDS[k], m])));
    },
  });

  if (!enabled) return null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (claim.isPending) return;
    const v = validateSchoolClaim(draft);
    const cur = mine.data?.current;
    if (Object.keys(v).length === 0 && cur && (cur.status === "PENDING" || cur.status === "VERIFIED") && sameClaimedSchool(draft, cur)) {
      v.school = cur.status === "PENDING" ? "This school is already waiting for verification. Choose a different school to replace it." : "This school is already verified for your account.";
    }
    setErrors(v);
    if (Object.keys(v).length === 0) claim.mutate();
  }

  const current = mine.data?.current ?? null;
  const pending = current?.status === "PENDING";
  const s = current ? STATUS[current.status] : null;
  const claimError = claim.error && Object.keys(errors).length === 0 ? (isApiError(claim.error) && claim.error.code ? SCHOOL_CLAIM_ERRORS[claim.error.code] : undefined) ?? errorMessage(claim.error) : null;

  return (
    <Section title="My school" icon={<School className="w-5 h-5" />} description="Your school is verified by an administrator. Your teachers can see you once it is verified.">
      {mine.isPending ? (
        <LoadingBlock />
      ) : mine.isError ? (
        <Alert tone="error">{errorMessage(mine.error)}</Alert>
      ) : (
        <div className="space-y-4" data-testid="my-school">
          {sent && <Alert tone="success">Thank you. An administrator will check your school.</Alert>}
          {current && s ? (
            <div className="rounded-xl border border-gray-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-gray-900">
                  {current.school?.name ?? current.claimedName ?? "—"}
                  {current.claimedCountry && current.claimedCountry !== "RW" && <span className="font-normal text-gray-500"> · {countryLabel(current.claimedCountry)}</span>}
                </p>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`} data-testid="my-school-status">
                  {s.label}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {s.text} Sent {formatDate(current.submittedAt)}
                {current.decidedAt ? ` · decided ${formatDate(current.decidedAt)}` : ""}.
              </p>
              {current.reason && <p className="text-xs text-gray-700 mt-2">Reason: {current.reason}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No school on your account yet.</p>
          )}

          {editing ? (
            <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="school-claim-form">
              <SchoolClaimFields
                value={draft}
                onChange={(d) => {
                  setDraft(d);
                  setErrors({});
                }}
                errors={errors}
              />
              {claimError && <Alert tone="error">{claimError}</Alert>}
              <div className="flex gap-3">
                <Button type="submit" loading={claim.isPending}>
                  Send for verification
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditing(false)} disabled={claim.isPending}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              {pending && <p className="text-xs text-gray-500">Chose the wrong school? Ask for the right one: it replaces the request that is waiting.</p>}
              <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setEditing(true);
                setSent(false);
                setDraft(emptyDraft("directory"));
                setErrors({});
                claim.reset();
              }}
            >
              {current ? "Change my school" : "Add my school"}
              </Button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
