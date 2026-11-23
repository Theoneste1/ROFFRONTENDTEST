"use client";

/**
 * Markers of a subject (tests.manageMarkers): the coaches authorised to mark its tests, authorise another coach, revoke
 * with a mandatory reason (audited). A coach's Olympiad interest is shown as a hint only: an interest never grants marking.
 * A Head Coach sees and authorises only coaches of the subjects they head (the backend enforces it).
 */
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { testMarkersApi, type MarkerAuthorization, type MarkerState, type TestSubject } from "@/lib/api/tests";
import { errorMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { REVOKE_REASON } from "@/lib/test-management/rules";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { ConfirmDialog, Notice, SearchInput, TableCard, TableMessage, btnPrimary, linkBtn, td, th } from "@/app/admin/components/adminUi";

const STATES: { label: string; value: MarkerState }[] = [
  { label: "Authorised", value: "active" },
  { label: "Revoked", value: "revoked" },
  { label: "All", value: "all" },
];

export default function MarkersPanel({ subject }: { subject: TestSubject }) {
  const qc = useQueryClient();
  const [state, setState] = useState<MarkerState>("active");
  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<MarkerAuthorization | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filters = { subjectId: subject.id, state, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.markers(filters), queryFn: () => testMarkersApi.list(filters), placeholderData: keepPreviousData });
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.tests.all });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-slate-900">Markers for {subject.name}</h3>
        <p className="mt-0.5 text-xs text-slate-700">Coaches authorised to mark {subject.name} tests. An Olympiad interest is only a hint: it never authorises marking.</p>
      </div>
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      <FilterPills label="Authorisations" options={STATES} value={state} onChange={(v) => { setState(v); setPage(1); }} />
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the markers" onRetry={() => list.refetch()} />
      ) : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Coach</th>
                <th className={th}>Authorised</th>
                <th className={th}>Status</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="markers-list">
              {list.data.data.length === 0 ? (
                <TableMessage colSpan={4}>{state === "revoked" ? "No revoked authorisation." : "No coach is authorised yet."}</TableMessage>
              ) : (
                list.data.data.map((a) => (
                  <tr key={a.id} className="text-xs" data-testid={`marker-${a.coach.username}`}>
                    <td className={td}>
                      <span className="font-semibold text-gray-900">{personName(a.coach)}</span>
                      <span className="ml-1 text-gray-600">@{a.coach.username}</span>
                      {a.coach.interestedInSubject && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-900">interested</span>}
                    </td>
                    <td className={`${td} text-gray-700`}>
                      {formatDateTime(a.grantedAt)}{a.grantedBy && ` by ${personName(a.grantedBy)}`}
                      {a.grantReason && <span className="block text-gray-600">“{a.grantReason}”</span>}
                    </td>
                    <td className={`${td} text-gray-700`}>
                      {a.active ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">Authorised</span>
                      ) : (
                        <>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">Revoked</span>
                          <span className="block text-gray-600">{formatDateTime(a.revokedAt)}{a.revokedBy && ` by ${personName(a.revokedBy)}`}: “{a.revokeReason}”</span>
                        </>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {a.active && <button type="button" className={linkBtn} onClick={() => setRevoking(a)} aria-label={`Revoke ${personName(a.coach)}`}>Revoke</button>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
      <Candidates subject={subject} onGranted={async (name) => { setNotice(`${name} is authorised to mark ${subject.name}.`); await refresh(); }} />
      {revoking && (
        <ConfirmDialog
          title={`Revoke ${personName(revoking.coach)}?`}
          body={`They will no longer be authorised to mark ${subject.name} tests. The reason is recorded in the audit log.`}
          confirmLabel="Revoke"
          tone="danger"
          note={REVOKE_REASON}
          onConfirm={async (reason) => {
            await testMarkersApi.revoke(revoking.id, reason);
            setNotice(`${personName(revoking.coach)} is no longer authorised.`);
            await refresh();
          }}
          onClose={() => setRevoking(null)}
        />
      )}
    </div>
  );
}

function Candidates({ subject, onGranted }: { subject: TestSubject; onGranted: (name: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({
    queryKey: [...queryKeys.tests.candidates(subject.id, q), page],
    queryFn: () => testMarkersApi.candidates(subject.id, q || undefined, page),
    placeholderData: keepPreviousData,
  });
  const grant = useMutation({
    mutationFn: (coachId: string) => testMarkersApi.grant({ coachId, subjectId: subject.id }),
    onSuccess: (a) => onGranted(personName(a.coach)),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <section aria-labelledby="authorise-heading" className="space-y-3 border-t border-slate-200 pt-5">
      <h3 id="authorise-heading" className="text-base font-bold text-slate-900">Authorise a coach</h3>
      <p className="text-xs text-slate-700">Active coach accounts{subject ? ` you can authorise for ${subject.name}` : ""}.</p>
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search coaches" label="Search coaches" />
      {error && <Alert tone="error">{error}</Alert>}
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the coaches" onRetry={() => list.refetch()} />
      ) : list.data.data.length === 0 ? (
        <p className="text-sm text-slate-700">No coach found.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200" data-testid="marker-candidates">
            {list.data.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" data-testid={`candidate-${c.username}`}>
                <span>
                  <span className="font-semibold text-slate-900">{personName(c)}</span> <span className="text-slate-600">@{c.username}</span>
                  {c.interestedInSubject && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-900">interested in {subject.name}</span>}
                  {c.markingRemoved && <span className="mt-0.5 block text-xs text-red-700">Marking taken away: {c.markingRemoved.reason}. Authorise to give it back.</span>}
                </span>
                {c.authorizationId && c.mayMark !== false ? (
                  <span className="text-xs font-semibold text-emerald-800">Authorised</span>
                ) : c.mayMark && c.programmeMember ? (
                  <span className="text-xs font-semibold text-emerald-800" title="Every coach of the programme marks its tests unless that was taken away">Marks by default (programme member)</span>
                ) : (
                  <button type="button" className={btnPrimary} disabled={grant.isPending} onClick={() => { setError(null); grant.mutate(c.id); }} aria-label={`Authorise ${personName(c)}`}>
                    Authorise
                  </button>
                )}
              </li>
            ))}
          </ul>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
    </section>
  );
}
