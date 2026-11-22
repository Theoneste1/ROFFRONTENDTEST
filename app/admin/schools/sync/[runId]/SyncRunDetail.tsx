"use client";

/**
 * /admin/schools/sync/:runId — a directory sync run: counts and reconciliation, the review
 * summary (what still blocks an apply), category approvals, every proposed change with its
 * decision, the rows (with proposals for conflicts and possible duplicates), recompare and the
 * CSV report (schools.manage). Approve and apply only for Super Admins (schools.syncDirectory).
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { schoolSyncApi, type SyncApplyResult, type SyncApproval, type SyncChangeKind, type SyncDecision, type SyncItem, type SyncItemOutcome } from "@/lib/api/school-sync";
import { isApiError } from "@/lib/api/errors";
import {
  CONFLICT_STATE_LABEL,
  DECISION_LABEL,
  KIND_LABEL,
  OUTCOME_LABEL,
  RUN_STATUS_LABEL,
  applyState,
  approvableCategories,
  approveState,
  blockerText,
  categoryDecisions,
  decisionBlocked,
  individualDecisions,
  isManualReview,
  outcomeLines,
  proposalPayload,
  proposalProblem,
  runOpen,
  showValue,
  syncErrorMessage,
  type ProposalForm,
  type SyncAccess,
} from "@/lib/admin/school-sync";
import { isUuid } from "@/lib/admin/school-directory";
import { invalidateSyncRun, useSyncAccess, useSyncCategories, useSyncChanges, useSyncItems, useSyncReview, useSyncRun } from "@/lib/queries/school-directory";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, Card, CsvButton, MetricCard, Modal, Notice, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../../components/adminUi";
import { BackLink, STATUS_BADGE } from "../shared";

const DECISION_BADGE: Record<SyncDecision, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

export default function SyncRunDetail({ runId }: { runId: string }) {
  const access = useSyncAccess();
  const back = <BackLink href="/admin/schools/sync" label="All sync runs" />;
  if (access.loading) return <AdminPage title="Directory sync run"><LoadingBlock /></AdminPage>;
  if (!access.visible) {
    return (
      <AdminPage title="Directory sync run">
        {back}
        <Notice tone="info">The official-directory sync needs schools.manage on a backend that supports it.</Notice>
      </AdminPage>
    );
  }
  if (!isUuid(runId)) return <AdminPage title="Directory sync run">{back}<ErrorState error={null} title="Run not found" /></AdminPage>;
  return <RunPage runId={runId} access={access} back={back} />;
}

function RunPage({ runId, access, back }: { runId: string; access: SyncAccess; back: React.ReactNode }) {
  const qc = useQueryClient();
  const run = useSyncRun(runId);
  const review = useSyncReview(runId);
  const [tab, setTab] = useState<"changes" | "rows">("changes");
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [approval, setApproval] = useState<SyncApproval | null>(null);
  const [confirm, setConfirm] = useState<"approve" | "apply" | null>(null);
  const [applied, setApplied] = useState<SyncApplyResult | null>(null);
  const refresh = (didApply = false) => invalidateSyncRun(qc, didApply);

  const recompare = useMutation({
    mutationFn: () => schoolSyncApi.recompare(runId),
    onSuccess: (r) => {
      setNotice({ tone: "success", text: `Compared again: ${r.kept} change(s) kept, ${r.added} new, ${r.retired} retired, ${r.reverted} returned to pending.` });
      void refresh();
    },
    onError: (e) => setNotice({ tone: "error", text: syncErrorMessage(e) }),
  });
  const approve = useMutation({
    mutationFn: () => schoolSyncApi.approve(runId),
    onSuccess: (a) => {
      setApproval(a);
      setConfirm(null);
      setNotice({ tone: "success", text: `Approved. Apply before ${formatDateTime(a.expiresAt)}; any later decision cancels the approval.` });
      void refresh();
    },
    onError: (e) => {
      setConfirm(null);
      setNotice({ tone: "error", text: syncErrorMessage(e) });
      void refresh();
    },
  });
  const apply = useMutation({
    mutationFn: () => schoolSyncApi.apply(runId, approval!.token),
    onSuccess: (r) => {
      setApplied(r);
      setApproval(null);
      setConfirm(null);
      setNotice({ tone: "success", text: "The approved changes were applied to the school directory." });
      void refresh(true);
    },
    onError: (e) => {
      setConfirm(null);
      setNotice({ tone: "error", text: syncErrorMessage(e) });
      void refresh();
    },
  });

  if (run.isError && isApiError(run.error) && run.error.status === 404) return <AdminPage title="Directory sync run">{back}<ErrorState error={null} title="Run not found" /></AdminPage>;
  if (run.isPending) return <AdminPage title="Directory sync run">{back}<LoadingBlock /></AdminPage>;
  if (run.isError) return <AdminPage title="Directory sync run">{back}<ErrorState error={run.error} title="Couldn't load the run" onRetry={() => run.refetch()} /></AdminPage>;

  const r = run.data;
  const open = runOpen(r);
  const approveGate = approveState(review.data, access);
  const applyGate = applyState(approval, review.data, access);
  const status = r.expired ? "Expired" : RUN_STATUS_LABEL[r.status];

  return (
    <AdminPage
      title={r.datasetLabel}
      description={`${r.dataSource.name} · ${r.fileName} · uploaded ${formatDateTime(r.createdAt)}${r.createdBy ? ` by @${r.createdBy.username}` : ""}`}
      actions={
        <>
          <CsvButton label="Report (CSV)" onDownload={() => schoolSyncApi.downloadReport(runId)} />
          {open && (
            <button type="button" className={btnSecondary} onClick={() => recompare.mutate()} disabled={recompare.isPending} data-testid="sync-recompare">
              {recompare.isPending && <Spinner className="h-3.5 w-3.5" />} Compare again
            </button>
          )}
          {access.canApprove && open && (
            <>
              <button type="button" className={btnSecondary} disabled={!approveGate.allowed || approve.isPending} title={approveGate.reason ?? undefined} onClick={() => setConfirm("approve")} data-testid="sync-approve">
                Approve
              </button>
              <button type="button" className={btnPrimary} disabled={!applyGate.allowed || apply.isPending} title={applyGate.reason ?? undefined} onClick={() => setConfirm("apply")} data-testid="sync-apply">
                Apply
              </button>
            </>
          )}
        </>
      }
    >
      {back}
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      {applied && (
        <Card>
          <div className="p-5 text-xs" data-testid="sync-applied">
            <h2 className="text-sm font-bold text-gray-800 mb-2">Applied {formatDateTime(applied.appliedAt)}</h2>
            <ul className="grid grid-cols-2 lg:grid-cols-4 gap-1 text-gray-700">
              {Object.entries(applied.counts).map(([k, v]) => (
                <li key={k}>
                  {k.replace(/([A-Z])/g, " $1").toLowerCase()}: <strong>{formatNumber(v)}</strong>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {r.counts?.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4" data-testid="sync-headline">
          <MetricCard label="Schools found" value={formatNumber(r.counts.summary.totalFound)} subtext="rows in the file" />
          <MetricCard
            label="Already in the directory"
            value={formatNumber(r.counts.summary.existing)}
            subtext={r.mode === "NEW_ONLY" ? "recognised by code — left untouched" : "recognised by code — differences proposed"}
          />
          <MetricCard
            label={r.status === "APPLIED" ? "New schools" : "New schools to import"}
            value={formatNumber(r.counts.summary.newSchools)}
            subtext="new official codes"
          />
          <MetricCard label="Needs attention" value={formatNumber(r.counts.summary.needsAttention)} subtext="no usable code, conflicts, invalid or possible duplicates" />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 my-4" data-testid="sync-counts">
        <MetricCard label="Status" value={<Badge className={STATUS_BADGE[r.expired ? "EXPIRED" : r.status]}>{status}</Badge>} subtext={r.status === "PREVIEW" ? `review until ${formatDateTime(r.expiresAt)}` : undefined} />
        <MetricCard label="Rows" value={formatNumber(r.rowCount)} />
        <MetricCard label="Unchanged" value={formatNumber(r.counts?.unchanged ?? 0)} subtext="matched, nothing to change" />
        <MetricCard label="Manual review" value={formatNumber(review.data?.manualReview.total ?? 0)} subtext={review.data ? `${review.data.manualReview.byState.OPEN ?? 0} open` : undefined} />
        <MetricCard
          label="Source totals"
          value={r.reconciliation?.summaryAvailable ? (r.reconciliation.mismatches ? `${r.reconciliation.mismatches} mismatch(es)` : "Match") : "—"}
          subtext={r.reconciliation?.summaryAvailable ? undefined : "no summary sheet"}
        />
      </div>

      <Card>
        <div className="p-5 text-xs space-y-2" data-testid="sync-summary">
          <p className="text-gray-700">
            <span className="font-semibold">Outcomes: </span>
            {outcomeLines(r.counts?.outcomes).map(([k, n]) => `${OUTCOME_LABEL[k]} ${formatNumber(n)}`).join(" · ") || "—"}
          </p>
          {review.data && (
            <>
              <p className="text-gray-700">
                <span className="font-semibold">Changes: </span>
                {(Object.keys(review.data.changes) as SyncChangeKind[])
                  .map((k) => {
                    const d = review.data!.changes[k]!;
                    return `${KIND_LABEL[k]} — ${d.APPROVED} approved, ${d.PENDING} pending, ${d.REJECTED} rejected`;
                  })
                  .join(" · ") || "none"}
              </p>
              {review.data.blockers.length > 0 ? (
                <div data-testid="sync-blockers">
                  <p className="font-semibold text-amber-700">Before it can be approved:</p>
                  <ul className="list-disc pl-5 text-amber-700">
                    {review.data.blockers.map((b) => (
                      <li key={b.code}>{blockerText(b)}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                open && <p className="text-emerald-700">Nothing blocks an approval. Pending changes are not applied.</p>
              )}
              <p className="text-gray-600">
                {review.data.run.approvedAt
                  ? `Last approved ${formatDateTime(review.data.run.approvedAt)}${review.data.run.approvedBy ? ` by @${review.data.run.approvedBy.username}` : ""}${review.data.run.approvalCurrent ? "" : " (no longer current)"}. `
                  : ""}
                {review.data.run.appliedAt ? `Applied ${formatDateTime(review.data.run.appliedAt)}${review.data.run.appliedBy ? ` by @${review.data.run.appliedBy.username}` : ""}. ` : ""}
                {!access.canApprove && open ? "A Super Admin approves and applies the reviewed run." : ""}
              </p>
            </>
          )}
          {review.isError && <Alert tone="error">{syncErrorMessage(review.error)}</Alert>}
        </div>
      </Card>

      {open && <CategoriesCard runId={runId} onDone={(text, tone = "success") => { setNotice({ tone, text }); void refresh(); }} />}

      <div role="tablist" aria-label="Run details" className="flex gap-2 my-4">
        {(["changes", "rows"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${tab === t ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
          >
            {t === "changes" ? "Proposed changes" : "Rows"}
          </button>
        ))}
      </div>
      {tab === "changes" ? (
        <ChangesTab runId={runId} open={open} superAdmin={access.canApprove} onDone={(text, tone = "success") => { setNotice({ tone, text }); void refresh(); }} />
      ) : (
        <RowsTab runId={runId} runStatus={r.status} open={open} onDone={(text, tone = "success") => { setNotice({ tone, text }); void refresh(); }} />
      )}

      {confirm === "approve" && (
        <Modal title="Approve this run?" onClose={() => !approve.isPending && setConfirm(null)}>
          <p className="text-sm text-gray-600 mb-4">
            Approving records you as the approver and gives a 30-minute window to apply exactly the approved changes. Any later decision or comparison cancels it.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" className={btnSecondary} onClick={() => setConfirm(null)} disabled={approve.isPending}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={() => approve.mutate()} disabled={approve.isPending} data-testid="sync-approve-confirm">
              {approve.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Approve
            </button>
          </div>
        </Modal>
      )}
      {confirm === "apply" && (
        <Modal title="Apply the approved changes?" onClose={() => !apply.isPending && setConfirm(null)}>
          <p className="text-sm text-gray-600 mb-4">
            The approved changes are written to the school directory in one audited step. Existing students, claims and Teacher assignments are kept. This cannot be undone from here.
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" className={btnSecondary} onClick={() => setConfirm(null)} disabled={apply.isPending}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={() => apply.mutate()} disabled={apply.isPending} data-testid="sync-apply-confirm">
              {apply.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Apply
            </button>
          </div>
        </Modal>
      )}
    </AdminPage>
  );
}

type Done = (text: string, tone?: "success" | "error" | "info") => void;

function CategoriesCard({ runId, onDone }: { runId: string; onDone: Done }) {
  const categories = useSyncCategories(runId);
  const [chosen, setChosen] = useState<SyncChangeKind[]>([]);
  const decide = useMutation({
    mutationFn: () => schoolSyncApi.decide(runId, categoryDecisions(categories.data ?? [], chosen)),
    onSuccess: (res) => {
      setChosen([]);
      onDone(res.blocked.length ? `Categories approved; ${res.blocked.length} change(s) stay pending until what they depend on is approved.` : "Categories approved.");
    },
    onError: (e) => {
      void categories.refetch();
      onDone(syncErrorMessage(e), "error");
    },
  });
  if (categories.isPending || categories.isError) return null;
  const approvable = approvableCategories(categories.data);
  if (approvable.length === 0) return null;
  return (
    <Card>
      <div className="p-5 mt-4 text-xs space-y-2" data-testid="sync-categories">
        <h2 className="text-sm font-bold text-gray-800">Approve by category</h2>
        <p className="text-gray-600">Approves every pending change of the category as listed now (explicit rejections stay). Changes, contacts and new places are decided one by one below.</p>
        {approvable.map((c) => (
          <label key={c.kind} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(c.kind)}
              onChange={(e) => setChosen((x) => (e.target.checked ? [...x, c.kind] : x.filter((k) => k !== c.kind)))}
            />
            <span>
              {KIND_LABEL[c.kind]} — {c.pending} pending of {c.total}
            </span>
          </label>
        ))}
        <button type="button" className={btnPrimary} disabled={!chosen.length || decide.isPending} onClick={() => decide.mutate()} data-testid="sync-approve-categories">
          {decide.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Approve selected categories
        </button>
      </div>
    </Card>
  );
}

function ChangesTab({ runId, open, superAdmin, onDone }: { runId: string; open: boolean; superAdmin: boolean; onDone: Done }) {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<SyncChangeKind | "">("");
  const [decision, setDecision] = useState<SyncDecision | "">("");
  const changes = useSyncChanges(runId, { page, ...(kind && { kind }), ...(decision && { decision }) });
  const decide = useMutation({
    mutationFn: ({ id, d }: { id: string; d: SyncDecision }) => schoolSyncApi.decide(runId, individualDecisions(changes.data?.data ?? [], { [id]: d })),
    onSuccess: (res) => onDone(res.reverted.length ? `Saved; ${res.reverted.length} dependent change(s) returned to pending.` : "Decision saved."),
    onError: (e) => onDone(syncErrorMessage(e), "error"),
  });
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-3">
        <SelectFilter
          label="Kind"
          value={kind}
          onChange={(v) => { setKind(v as SyncChangeKind | ""); setPage(1); }}
          options={[{ label: "All", value: "" }, ...(Object.keys(KIND_LABEL) as SyncChangeKind[]).map((k) => ({ label: KIND_LABEL[k], value: k }))]}
        />
        <SelectFilter
          label="Decision"
          value={decision}
          onChange={(v) => { setDecision(v as SyncDecision | ""); setPage(1); }}
          options={[{ label: "All", value: "" }, ...(Object.keys(DECISION_LABEL) as SyncDecision[]).map((k) => ({ label: DECISION_LABEL[k], value: k }))]}
        />
      </div>
      {changes.isError ? (
        <ErrorState error={changes.error} title="Couldn't load the changes" onRetry={() => changes.refetch()} />
      ) : (
        <TableCard
          footer={
            changes.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={changes.data.meta.totalPages} total={changes.data.meta.total} onPage={setPage} disabled={changes.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Row</th>
              <th className={th}>Change</th>
              <th className={th}>Now</th>
              <th className={th}>Published</th>
              <th className={th}>Decision</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="sync-changes">
            {changes.isPending ? (
              <TableMessage colSpan={6}>Loading changes…</TableMessage>
            ) : changes.data.data.length === 0 ? (
              <TableMessage colSpan={6}>No proposed changes{kind || decision ? " match the filters" : ""}.</TableMessage>
            ) : (
              changes.data.data.map((c) => {
                const blocked = decisionBlocked(c, { open, superAdmin });
                return (
                  <tr key={c.id} className="text-xs align-top" data-kind={c.kind}>
                    <td className={td}>{c.item?.rowNumber ?? "—"}</td>
                    <td className={td}>
                      <span className="font-semibold text-gray-800">{KIND_LABEL[c.kind]}</span>
                      {c.field && <span className="block text-gray-600">{c.field}</span>}
                    </td>
                    <td className={`${td} text-gray-600 max-w-[14rem] break-words`}>{showValue(c.currentValue)}</td>
                    <td className={`${td} text-gray-800 max-w-[14rem] break-words`}>{showValue(c.publishedValue)}</td>
                    <td className={td}>
                      <Badge className={DECISION_BADGE[c.decision]}>{DECISION_LABEL[c.decision]}</Badge>
                      {c.decidedBy && <span className="block text-[11px] text-gray-500">@{c.decidedBy.username}</span>}
                      {c.appliedAt && <span className="block text-[11px] text-emerald-600">applied</span>}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {blocked ? (
                        <span className="text-[11px] text-gray-500">{open ? blocked : ""}</span>
                      ) : (
                        <span className="inline-flex gap-2">
                          {(["APPROVED", "REJECTED", "PENDING"] as const)
                            .filter((d) => d !== c.decision)
                            .map((d) => (
                              <button key={d} type="button" className={linkBtn} disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, d })}>
                                {d === "APPROVED" ? "Approve" : d === "REJECTED" ? "Reject" : "Undo"}
                              </button>
                            ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}
    </>
  );
}

function RowsTab({ runId, runStatus, open, onDone }: { runId: string; runStatus: "PREVIEW" | "APPLIED" | "EXPIRED" | "SUPERSEDED"; open: boolean; onDone: Done }) {
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState<SyncItemOutcome | "">("");
  const [proposing, setProposing] = useState<SyncItem | null>(null);
  const items = useSyncItems(runId, { page, ...(outcome && { outcome }) });
  const canPropose = open || runStatus === "APPLIED";
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-3">
        <SelectFilter
          label="Outcome"
          value={outcome}
          onChange={(v) => { setOutcome(v as SyncItemOutcome | ""); setPage(1); }}
          options={[{ label: "All", value: "" }, ...(Object.keys(OUTCOME_LABEL) as SyncItemOutcome[]).map((k) => ({ label: OUTCOME_LABEL[k], value: k }))]}
        />
      </div>
      {items.isError ? (
        <ErrorState error={items.error} title="Couldn't load the rows" onRetry={() => items.refetch()} />
      ) : (
        <TableCard
          footer={
            items.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={items.data.meta.totalPages} total={items.data.meta.total} onPage={setPage} disabled={items.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Row</th>
              <th className={th}>School (as published)</th>
              <th className={th}>Place</th>
              <th className={th}>Outcome</th>
              <th className={th}>Issues</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="sync-items">
            {items.isPending ? (
              <TableMessage colSpan={6}>Loading rows…</TableMessage>
            ) : items.data.data.length === 0 ? (
              <TableMessage colSpan={6}>No rows{outcome ? " with this outcome" : ""}.</TableMessage>
            ) : (
              items.data.data.map((it) => {
                const n = it.normalized;
                const d = it.details ?? {};
                const name = n?.name ?? (typeof d.name === "string" ? d.name : null);
                return (
                  <tr key={it.id} className="text-xs align-top">
                    <td className={td}>{it.rowNumber ?? "—"}</td>
                    <td className={`${td} font-semibold text-gray-800`}>
                      {name ?? "—"}
                      {(n?.rawCode || typeof d.code === "string") && <span className="block font-normal text-gray-600">code {n?.rawCode || String(d.code)}</span>}
                    </td>
                    <td className={`${td} text-gray-600`}>{[n?.sector ?? d.sector, n?.district ?? d.district, n?.province].filter(Boolean).map(String).join(", ") || "—"}</td>
                    <td className={td}>
                      <Badge className={it.outcome === "MATCHED" ? "bg-emerald-50 text-emerald-700" : it.outcome === "NEW" ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}>{OUTCOME_LABEL[it.outcome]}</Badge>
                      {it.conflictState && <span className="block text-[11px] text-gray-600">{CONFLICT_STATE_LABEL[it.conflictState]}</span>}
                      {Array.isArray(d.reasons) && <span className="block text-[11px] text-gray-600">{(d.reasons as string[]).map((x) => x.toLowerCase().replace(/_/g, " ")).join("; ")}</span>}
                    </td>
                    <td className={`${td} text-gray-600`}>{it.issues.length ? [...new Set(it.issues.map((x) => x.code.toLowerCase().replace(/_/g, " ")))].join("; ") : "—"}</td>
                    <td className={td}>
                      {canPropose && isManualReview(it) && it.conflictState !== "RESOLVED" && (
                        <button type="button" className={linkBtn} onClick={() => setProposing(it)}>
                          Propose resolution
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}
      {proposing && (
        <ProposalDialog
          runId={runId}
          item={proposing}
          runStatus={runStatus}
          onClose={() => setProposing(null)}
          onDone={(t) => {
            setProposing(null);
            onDone(t);
          }}
        />
      )}
    </>
  );
}

function ProposalDialog({ runId, item, runStatus, onClose, onDone }: { runId: string; item: SyncItem; runStatus: "PREVIEW" | "APPLIED" | "EXPIRED" | "SUPERSEDED"; onClose: () => void; onDone: (text: string) => void }) {
  const candidates = item.details?.candidates ?? [];
  const [form, setForm] = useState<ProposalForm>({ action: "LINK", schoolId: candidates[0]?.id ?? "", code: "", note: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const propose = useMutation({
    mutationFn: () => schoolSyncApi.propose(runId, item.id, proposalPayload(form)),
    onSuccess: () => onDone("Resolution proposed. A Super Admin decides it (Proposed changes → Resolve a conflict)."),
  });
  function submit() {
    const p = proposalProblem(item, form, runStatus);
    setProblem(p);
    if (!p) propose.mutate();
  }
  return (
    <Modal wide title={`Row ${item.rowNumber ?? ""}: propose a resolution`} onClose={() => !propose.isPending && onClose()}>
      <div className="space-y-3 text-xs" data-testid="sync-proposal">
        <div className="flex gap-4">
          {(["LINK", "CREATE"] as const).map((a) => (
            <label key={a} className="flex items-center gap-1.5">
              <input type="radio" name="proposal-action" checked={form.action === a} disabled={a === "CREATE" && runStatus === "APPLIED"} onChange={() => setForm({ ...form, action: a })} />
              {a === "LINK" ? "It is an existing school" : "It is a new school"}
            </label>
          ))}
        </div>
        {form.action === "LINK" &&
          (candidates.length ? (
            <label className="block">
              <span className="block font-semibold text-gray-600 mb-1">School</span>
              <select value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} className="w-full border border-gray-200 rounded-lg px-2 py-1.5">
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""} — {[c.sector, c.district].filter(Boolean).join(", ")}
                    {c.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="block font-semibold text-gray-600 mb-1">School id</span>
              <input value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value.trim() })} placeholder="The school's id (from its page address)" className="w-full border border-gray-200 rounded-lg px-2 py-1.5" />
            </label>
          ))}
        {runStatus !== "APPLIED" && (
          <label className="block">
            <span className="block font-semibold text-gray-600 mb-1">Verified official code (optional)</span>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={6} inputMode="numeric" className="w-32 border border-gray-200 rounded-lg px-2 py-1.5" />
          </label>
        )}
        <label className="block">
          <span className="block font-semibold text-gray-600 mb-1">Note (optional)</span>
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} maxLength={500} className="w-full border border-gray-200 rounded-lg p-2" />
        </label>
        {problem && <p className="text-red-600">{problem}</p>}
        {propose.isError && <Alert tone="error">{syncErrorMessage(propose.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={propose.isPending}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={propose.isPending}>
            {propose.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Propose
          </button>
        </div>
      </div>
    </Modal>
  );
}
