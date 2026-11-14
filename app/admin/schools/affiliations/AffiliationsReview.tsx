"use client";

/**
 * Students' school claims (`/admin/school-affiliations`, schools.manage). A claim
 * is PENDING until an Administrator decides; teachers see a student only while
 * the claim is VERIFIED. Decisions, as the backend allows them:
 *   PENDING with a school → verify (optional note) or reject (reason shown to the student)
 *   PENDING, name only    → match it to a school first (it stays PENDING), or reject
 *   VERIFIED              → revoke (reason shown to the student)
 *   REJECTED / REVOKED    → reopen as a new PENDING claim (reason)
 * Only on a backend advertising `schoolAffiliations`.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { affiliationsAdminApi, type AffiliationStatus, type SchoolAffiliation } from "@/lib/api/accounts";
import { hasFeature } from "@/lib/api/capabilities";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { countryLabel } from "@/lib/accounts/school-claim";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import type { SchoolRef } from "@/lib/api/types";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, ConfirmDialog, FilterPills, Modal, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";
import { SchoolPicker } from "../../users/components/userUi";

const STATUSES: { label: string; value: AffiliationStatus }[] = [
  { label: "Waiting", value: "PENDING" },
  { label: "Verified", value: "VERIFIED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Revoked", value: "REVOKED" },
];
const REASON = { label: "Reason (shown to the student)", required: true, min: 3, max: 500 };
const NOTE = { label: "Note (optional)", required: false, min: 3, max: 500 };
const ERRORS: Record<string, string> = {
  AFFILIATION_SUPERSEDED: "The student has asked for another school since; this claim is no longer current.",
  AFFILIATION_STATUS_CONFLICT: "Someone else decided this claim at the same time. The list has been refreshed.",
  AFFILIATION_SCHOOL_REQUIRED: "Match the claim to a school before verifying it.",
  AFFILIATION_ALREADY_RESOLVED: "This claim has already been decided.",
  SCHOOL_INACTIVE: "That school is no longer active.",
  SCHOOL_COUNTRY_MISMATCH: "That school is in another country than the one the student named.",
};
const message = (e: unknown) => (isApiError(e) && e.code && ERRORS[e.code]) || errorMessage(e);

type Decision = { kind: "verify" | "reject" | "revoke" | "reopen"; claim: SchoolAffiliation };

export default function AffiliationsReview() {
  const { can } = useSession();
  const enabled = hasFeature(useBackendCapabilities().detection, "schoolAffiliations") && can("schools.manage");
  const qc = useQueryClient();
  const [status, setStatus] = useState<AffiliationStatus>("PENDING");
  const [page, setPage] = useState(1);
  const filters = { status, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.accounts.affiliations(filters), queryFn: () => affiliationsAdminApi.list(filters), enabled, placeholderData: keepPreviousData });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [matching, setMatching] = useState<SchoolAffiliation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.accounts.all });

  if (!enabled) {
    return (
      <AdminPage title="School verification">
        <Notice tone="info">School verification needs the schools.manage permission on a server that supports school affiliations.</Notice>
      </AdminPage>
    );
  }

  const rows = list.data?.data ?? [];
  const run = async (d: Decision, text: string) => {
    const id = d.claim.id;
    try {
      if (d.kind === "verify") await affiliationsAdminApi.verify(id, text || undefined);
      else if (d.kind === "reject") await affiliationsAdminApi.reject(id, text);
      else if (d.kind === "revoke") await affiliationsAdminApi.revoke(id, text);
      else await affiliationsAdminApi.reopen(id, text);
    } catch (e) {
      // The dialog shows the backend's message; a conflict means the list is stale.
      if (isApiError(e) && e.status === 409) void refresh();
      throw e;
    }
    setNotice(`${d.claim.student.firstName} ${d.claim.student.lastName}: ${d.kind === "verify" ? "school verified" : d.kind === "reject" ? "claim rejected" : d.kind === "revoke" ? "verification revoked" : "claim reopened"}.`);
    void refresh();
  };

  return (
    <AdminPage title="School verification" description="Students' schools are confirmed here. Teachers see a student only once the school is verified.">
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}
      <div className="mb-6">
        <FilterPills
          label="Status"
          options={STATUSES}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the school claims" onRetry={() => list.refetch()} />
      ) : (
        <TableCard footer={list.data && <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>Student</th>
              <th className={th}>School claimed</th>
              <th className={th}>Sent</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="affiliations">
            {list.isPending ? (
              <TableMessage colSpan={4}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={4}>No {STATUSES.find((s) => s.value === status)!.label.toLowerCase()} claims.</TableMessage>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td className={td}>
                    <p className="font-semibold text-gray-800">
                      {c.student.firstName} {c.student.lastName}
                    </p>
                    <p className="text-xs text-gray-400">
                      @{c.student.username}
                      {c.student.gradeLevel ? ` · ${c.student.gradeLevel}` : ""}
                    </p>
                  </td>
                  <td className={`${td} text-gray-700`}>
                    {c.school ? (
                      <>
                        {c.school.name}
                        <span className="block text-xs text-gray-400">
                          {c.school.code ? `code ${c.school.code} · ` : ""}
                          {c.school.location}
                        </span>
                      </>
                    ) : (
                      <>
                        {c.claimedName ?? "—"} <span className="text-[11px] text-amber-700">(not in the directory)</span>
                        <span className="block text-xs text-gray-400">
                          {c.claimedCountry && c.claimedCountry !== "RW" ? countryLabel(c.claimedCountry) : [c.claimedSector, c.claimedDistrict, c.claimedProvince].filter(Boolean).join(", ") || "No place given"}
                        </span>
                      </>
                    )}
                    {(c.decisionReason || c.revokeReason) && <span className="block text-xs text-gray-500 mt-1">Reason: {c.revokeReason ?? c.decisionReason}</span>}
                  </td>
                  <td className={`${td} text-gray-600 text-xs`}>
                    {formatDate(c.createdAt)}
                    <span className="block text-gray-400">{c.source.toLowerCase()}</span>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                    {c.status === "PENDING" && c.school && (
                      <button type="button" className={linkBtn} onClick={() => setDecision({ kind: "verify", claim: c })}>
                        Verify
                      </button>
                    )}
                    {c.status === "PENDING" && !c.school && (
                      <button type="button" className={linkBtn} onClick={() => setMatching(c)}>
                        Match to a school
                      </button>
                    )}
                    {c.status === "PENDING" && (
                      <button type="button" className={linkBtn} onClick={() => setDecision({ kind: "reject", claim: c })}>
                        Reject
                      </button>
                    )}
                    {c.status === "VERIFIED" && (
                      <button type="button" className={linkBtn} onClick={() => setDecision({ kind: "revoke", claim: c })}>
                        Revoke
                      </button>
                    )}
                    {(c.status === "REJECTED" || c.status === "REVOKED") && (
                      <button type="button" className={linkBtn} onClick={() => setDecision({ kind: "reopen", claim: c })}>
                        Reopen
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {decision && (
        <ConfirmDialog
          title={
            decision.kind === "verify" ? "Verify this school?" : decision.kind === "reject" ? "Reject this school claim?" : decision.kind === "revoke" ? "Revoke this verification?" : "Reopen this claim?"
          }
          body={`${decision.claim.student.firstName} ${decision.claim.student.lastName} — ${decision.claim.school?.name ?? decision.claim.claimedName ?? ""}.${decision.kind === "verify" ? " The student's teachers at this school will see them." : decision.kind === "revoke" ? " The school's teachers stop seeing this student." : ""}`}
          confirmLabel={decision.kind === "verify" ? "Verify" : decision.kind === "reject" ? "Reject" : decision.kind === "revoke" ? "Revoke" : "Reopen"}
          tone={decision.kind === "reject" || decision.kind === "revoke" ? "danger" : "primary"}
          note={decision.kind === "verify" ? NOTE : REASON}
          onClose={() => setDecision(null)}
          onConfirm={(text) => run(decision, text)}
        />
      )}
      {matching && (
        <MatchDialog
          claim={matching}
          onClose={() => setMatching(null)}
          onMatched={() => {
            setNotice(`${matching.student.firstName} ${matching.student.lastName}: claim linked to a school. Verify it to confirm.`);
            setMatching(null);
            void refresh();
          }}
        />
      )}
    </AdminPage>
  );
}

function MatchDialog({ claim, onClose, onMatched }: { claim: SchoolAffiliation; onClose: () => void; onMatched: () => void }) {
  const candidates = useQuery({ queryKey: queryKeys.accounts.candidates(claim.id), queryFn: () => affiliationsAdminApi.candidates(claim.id) });
  const [other, setOther] = useState<SchoolRef | null>(null);
  const [differentPlace, setDifferentPlace] = useState<string | null>(null);
  const match = useMutation({
    mutationFn: ({ schoolId, confirm }: { schoolId: string; confirm?: boolean }) => affiliationsAdminApi.match(claim.id, { schoolId, ...(confirm && { confirmDifferentPlace: true }) }),
    onSuccess: onMatched,
    onError: (e, v) => {
      if (isApiError(e) && e.code === "SCHOOL_PLACE_MISMATCH") setDifferentPlace(v.schoolId);
    },
  });
  const pick = (schoolId: string) => {
    setDifferentPlace(null);
    match.mutate({ schoolId });
  };

  return (
    <Modal wide title={`Match “${claim.claimedName ?? ""}” to a school`} onClose={onClose}>
      <div className="space-y-4" data-testid="match-dialog">
        <p className="text-xs text-gray-500">
          The student named a school that isn&apos;t linked to the directory. Choose the right one; the claim stays waiting until you verify it.
        </p>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Schools with this name</h3>
        {candidates.isPending ? (
          <LoadingBlock />
        ) : candidates.isError ? (
          <ErrorState error={candidates.error} />
        ) : candidates.data.length === 0 ? (
          <p className="text-sm text-gray-500">No school with this name. Search below.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {candidates.data.map((s) => (
              <li key={s.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {s.name}
                  {!s.isActive && <span className="ml-1.5 text-[11px] text-gray-400">(inactive)</span>}
                  <span className="block text-xs text-gray-400">
                    {s.code ? `code ${s.code} · ` : ""}
                    {[s.sector, s.district, s.province].filter(Boolean).join(", ") || s.countryCode}
                  </span>
                </span>
                <button type="button" className={btnSecondary} disabled={match.isPending || !s.isActive} onClick={() => pick(s.id)}>
                  Choose
                </button>
              </li>
            ))}
          </ul>
        )}
        <SchoolPicker label="Or search all schools" value={other} onChange={setOther} />
        {other && (
          <button type="button" className={btnPrimary} disabled={match.isPending} onClick={() => pick(other.id)}>
            Match to {other.name}
          </button>
        )}
        {differentPlace ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <p className="text-xs text-amber-800">This school is in a different place from the one the student gave. Match it anyway?</p>
            <button type="button" className={btnPrimary} disabled={match.isPending} onClick={() => match.mutate({ schoolId: differentPlace, confirm: true })}>
              Yes, match it
            </button>
          </div>
        ) : (
          match.error && <p className="text-xs text-red-600">{message(match.error)}</p>
        )}
      </div>
    </Modal>
  );
}
