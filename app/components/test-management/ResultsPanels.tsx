"use client";

/**
 * Test Management, Phase 4 (capability `testResults`) — the staff tabs of a test page:
 *   - PublishingPanel (tests.publishResults): counts, the unapproved results, warnings (extensions still running), Publish;
 *     a Head Coach is blocked while results are unapproved (no override control); an Administrator may "Override and
 *     publish" with a mandatory reason (tests.overridePublication). Publications and withdrawals (G6) below.
 *   - RankingsPanel (tests.viewRankings): internal rankings overall / by division / by school (competition rank).
 *   - ResultsReportPanel (tests.viewResults): the report (counts, average, median, distribution, per question, per
 *     school, per division), the results with identity, CSV exports.
 * The backend decides everything; these screens only show and send.
 */
import { useId, useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { testResultsApi, type ExportType, type PublishResult, type RankingBy, type RankingDivision } from "@/lib/api/test-results";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { SUBMISSION_STATUS_LABEL, newClientKey } from "@/lib/test-management/submissions";
import {
  DIVISION_TEXT, EXPORTS, OVERRIDE_REASON_MAX, RANKING_BY, TESTS_OVERRIDE_PUBLICATION, WARNING_TEXT, barWidths, groupLabel, groupStarts,
  overrideReasonProblem, publishMode, rankText, scoreText, statText,
} from "@/lib/test-management/results";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { MetricCard, Modal, Notice, SearchInput, TableCard, TableMessage, btnDanger, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { SubmissionStatusBadge } from "./DistributionPanel";
import LevelName from "./LevelName";
import { useDivisions } from "@/lib/queries/divisions";
import { activeDivisions } from "@/lib/divisions/divisions";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";
import StudentName from "@/app/components/students/StudentName";

const invalidateResults = (qc: ReturnType<typeof useQueryClient>, testId: string) =>
  qc.invalidateQueries({ queryKey: [...queryKeys.tests.all, "results", testId] });

// ── Publishing ────────────────────────────────────────────────────────────────

export function PublishingPanel({ testId }: { testId: string }) {
  const qc = useQueryClient();
  const { can, permissionsStatus } = useSession();
  const mayOverride = actionAllowed(TESTS_OVERRIDE_PUBLICATION, permissionsStatus, can);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const filters = { page, limit: 20 };
  const preview = useQuery({ queryKey: queryKeys.tests.publication(testId, filters), queryFn: () => testResultsApi.preview(testId, filters), placeholderData: keepPreviousData });
  const pubs = useQuery({ queryKey: queryKeys.tests.publications(testId), queryFn: () => testResultsApi.publications(testId, { limit: 20 }) });
  const done = async (r: PublishResult) => {
    setError(null);
    setNotice(r.replayed
      ? `Nothing new to publish: publication ${r.publication.number} already holds every approved result.`
      : `Published ${r.published} ${r.published === 1 ? "result" : "results"} (publication ${r.publication.number}). The students and their teachers are told once.`);
    await invalidateResults(qc, testId);
    // Every marking view of the test (review list, an open review's detail, the overview): the statuses moved to
    // PUBLISHED. A stale detail would send an outdated expectedStatus (the server refuses it with 409 SUBMISSION_CHANGED).
    await qc.invalidateQueries({ queryKey: queryKeys.tests.marking(testId) });
  };
  const publish = useMutation({
    // A new key per click: a retried request of the same click replays; the server also replays when nothing is new.
    mutationFn: () => testResultsApi.publish(testId, { clientKey: newClientKey() }),
    onSuccess: done,
    onError: async (e) => {
      setNotice(null);
      setError(isApiError(e) && e.code === "PUBLICATION_BLOCKED"
        ? "Blocked: some results are not approved yet. Approve them first." + (mayOverride ? " An Administrator may override with a reason." : "")
        : errorMessage(e));
      await invalidateResults(qc, testId);
    },
  });

  if (preview.isPending) return <LoadingBlock />;
  if (preview.isError) return <ErrorState error={preview.error} title="Couldn't load the publication preview" onRetry={() => preview.refetch()} />;
  const p = preview.data;
  const mode = publishMode(p.actions, p.counts.approved);
  return (
    <div className="space-y-6" data-testid="publishing-panel">
      <div>
        <h3 className="text-base font-bold text-slate-900">Publishing</h3>
        <p className="mt-0.5 text-xs text-slate-700">
          Only approved results are published. Students then see their own marks per question, total and comments; teachers see their school&apos;s
          students. Nobody outside the staff sees rankings.
        </p>
      </div>
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="publication-counts">
        <MetricCard label="Submissions" value={p.counts.total} />
        <MetricCard label="Approved, waiting" value={<span data-testid="count-approved">{p.counts.approved}</span>} />
        <MetricCard label="Published" value={<span data-testid="count-published">{p.counts.published}</span>} />
        <MetricCard label="Not approved" value={<span data-testid="count-unapproved">{p.counts.unapproved}</span>} />
      </div>
      {p.counts.total > 0 && (
        <p className="text-xs text-slate-700" data-testid="counts-by-status">
          {Object.entries(p.counts.byStatus).map(([s, n]) => `${SUBMISSION_STATUS_LABEL[s as keyof typeof SUBMISSION_STATUS_LABEL] ?? s}: ${n}`).join(" · ")}
        </p>
      )}
      {p.warnings.length > 0 && (
        <ul className="space-y-2" data-testid="publication-warnings">
          {p.warnings.map((w) => <li key={w}><Alert tone="info">{WARNING_TEXT[w]}</Alert></li>)}
        </ul>
      )}
      {p.activeExtensions.length > 0 && (
        <section aria-label="Extensions still running">
          <h4 className="mb-2 text-sm font-bold text-slate-900">Extensions still running</h4>
          <ul className="space-y-1 text-sm text-slate-800" data-testid="active-extensions">
            {p.activeExtensions.map((e) => (
              <li key={e.id}>
                {e.kind === "TEST" ? "Whole test" : e.kind === "STUDENT" ? `Student ${personName(e.student)}` : `Teacher ${personName(e.teacher)}`} — until {formatDateTime(e.newDeadline)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {mode === "publish" && (
          <button type="button" className={btnPrimary} disabled={publish.isPending} onClick={() => publish.mutate()} data-testid="publish-results">
            {publish.isPending ? "Publishing…" : `Publish ${p.counts.approved} approved ${p.counts.approved === 1 ? "result" : "results"}`}
          </button>
        )}
        {mode === "blocked" && (
          <Alert tone="info">
            <span data-testid="publication-blocked">
              Publishing is blocked: {p.counts.unapproved} {p.counts.unapproved === 1 ? "result is" : "results are"} not approved yet. Approve them first —
              only an Administrator can override this check.
            </span>
          </Alert>
        )}
        {mode === "override" && (
          <>
            <Alert tone="info">{p.counts.unapproved} {p.counts.unapproved === 1 ? "result is" : "results are"} not approved. You may override with a reason: only the {p.counts.approved} approved will be published.</Alert>
            <button type="button" className={btnDanger} onClick={() => setOverriding(true)} data-testid="override-publish">Override and publish</button>
          </>
        )}
        {mode === "nothing" && <p className="text-sm text-slate-700" data-testid="nothing-to-publish">{p.counts.published > 0 ? "Every approved result is published." : "No approved result to publish yet."}</p>}
      </div>

      <section aria-labelledby="unapproved-h">
        <h4 id="unapproved-h" className="mb-2 text-sm font-bold text-slate-900">Not approved ({p.unapproved.meta.total})</h4>
        <TableCard footer={<Pagination page={p.unapproved.meta.page} totalPages={p.unapproved.meta.totalPages} total={p.unapproved.meta.total} onPage={setPage} />}>
          <thead><tr className="border-b border-gray-100"><th className={th}>Student</th><th className={th}>School</th><th className={th}>Code</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="unapproved-rows">
            {p.unapproved.data.length === 0 ? <TableMessage colSpan={4}>Every result is approved or published.</TableMessage> : p.unapproved.data.map((u) => (
              <tr key={u.id} className="text-sm">
                <td className={`${td} font-semibold text-gray-900`}>{personName(u.student)}</td>
                <td className={`${td} text-gray-700`}>{u.student.school?.name ?? "—"}</td>
                <td className={`${td} font-mono text-xs text-gray-700`}>{u.publicCode}</td>
                <td className={td}><SubmissionStatusBadge status={u.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </section>

      <section aria-labelledby="publications-h">
        <h4 id="publications-h" className="mb-2 text-sm font-bold text-slate-900">Publications</h4>
        {pubs.isPending ? <LoadingBlock /> : pubs.isError ? <ErrorState error={pubs.error} title="Couldn't load the publications" onRetry={() => pubs.refetch()} /> : (
          <>
            <TableCard>
              <thead><tr className="border-b border-gray-100"><th className={th}>#</th><th className={th}>When</th><th className={th}>By</th><th className={th}>Published</th><th className={th}>Override</th><th className={th}>Withdrawn since</th></tr></thead>
              <tbody className="divide-y divide-gray-100/80" data-testid="publication-rows">
                {pubs.data.data.length === 0 ? <TableMessage colSpan={6}>Not published yet.</TableMessage> : pubs.data.data.map((x) => (
                  <tr key={x.id} className="text-sm">
                    <td className={`${td} font-semibold`}>{x.number}</td>
                    <td className={`${td} whitespace-nowrap text-gray-700`}>{formatDateTime(x.createdAt)}</td>
                    <td className={`${td} text-gray-700`}>{x.publishedBy ? personName(x.publishedBy) : x.actorRole}</td>
                    <td className={td}>{x.publishedCount}</td>
                    <td className={`${td} text-gray-800`}>{x.override ? <><span className="font-semibold text-rose-800">Yes</span><span className="block text-xs text-gray-700">“{x.overrideReason}”</span></> : "No"}</td>
                    <td className={td}>{x.withdrawn}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
            {pubs.data.withdrawals.length > 0 && (
              <div className="mt-4" data-testid="withdrawals">
                <h4 className="mb-2 text-sm font-bold text-slate-900">Withdrawn results (unlocked after publication)</h4>
                <ul className="space-y-1 text-sm text-slate-800">
                  {pubs.data.withdrawals.map((w) => (
                    <li key={w.id}>
                      {formatDateTime(w.createdAt)} — {personName(w.submission.student)} <span className="font-mono text-xs">{w.submission.publicCode}</span>: “{w.reason}”
                      {w.withdrawnBy && <> by {personName(w.withdrawnBy)}</>} · now {SUBMISSION_STATUS_LABEL[w.submission.status]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {overriding && (
        <OverrideDialog testId={testId} approved={p.counts.approved} unapproved={p.counts.unapproved} onClose={() => setOverriding(false)}
          onDone={async (r) => { setOverriding(false); await done(r); }} />
      )}
    </div>
  );
}

function OverrideDialog({ testId, approved, unapproved, onClose, onDone }: {
  testId: string; approved: number; unapproved: number; onClose: () => void; onDone: (r: PublishResult) => Promise<void>;
}) {
  const ids = useId();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newClientKey());
  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = overrideReasonProblem(reason);
    setProblem(p);
    if (p) return;
    setBusy(true);
    setError(null);
    try {
      await onDone(await testResultsApi.publishWithOverride(testId, { reason: reason.trim(), clientKey: key }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Override and publish" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="override-form">
        <p className="text-sm text-slate-800">
          {unapproved} {unapproved === 1 ? "result is" : "results are"} not approved. Only the {approved} approved {approved === 1 ? "result is" : "results are"} published;
          the others stay hidden. Your reason is recorded in the audit log.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <label htmlFor={`${ids}-reason`} className={labelCls}>Reason <span className="text-amber-600" aria-hidden="true">*</span></label>
          <textarea id={`${ids}-reason`} rows={3} maxLength={OVERRIDE_REASON_MAX} className={`${inputCls} ${problem ? inputBad : inputOk}`} value={reason}
            onChange={(e) => setReason(e.target.value)} aria-invalid={!!problem} aria-describedby={`${ids}-reason-d`} data-testid="override-reason" />
          <p id={`${ids}-reason-d`} className={`mt-1 text-xs ${problem ? "text-red-700" : "text-slate-600"}`}>{problem ?? "Mandatory, at least 10 characters."}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnDanger} disabled={busy} data-testid="override-confirm">{busy ? "Publishing…" : "Override and publish"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Rankings ──────────────────────────────────────────────────────────────────

export function RankingsPanel({ testId }: { testId: string }) {
  const ids = useId();
  const [by, setBy] = useState<RankingBy>("overall");
  const [division, setDivision] = useState<"" | RankingDivision>("");
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const levels = activeDivisions(useDivisions().data);
  const filters = { by, ...(by === "division" && division && { division }), ...(publishedOnly && { published: true }), page, limit: 50 };
  const list = useQuery({ queryKey: queryKeys.tests.rankings(testId, filters), queryFn: () => testResultsApi.rankings(testId, filters), placeholderData: keepPreviousData });
  const rows = list.data?.data ?? [];
  const starts = groupStarts(rows);
  return (
    <div className="space-y-4" data-testid="rankings-panel">
      <div>
        <h3 className="text-base font-bold text-slate-900">Rankings</h3>
        <p className="mt-0.5 text-xs text-slate-700">Internal only (Administrators and the subject&apos;s Head Coaches). Equal totals share a rank (=2); the next rank skips the tied places.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <FilterPills label="Ranking" options={[...RANKING_BY]} value={by} onChange={(v) => { setBy(v); setPage(1); }} />
        {by === "division" && (
          <div>
            <label htmlFor={`${ids}-div`} className={labelCls}>Division</label>
            <select id={`${ids}-div`} className={`${inputCls} ${inputOk}`} value={division} onChange={(e) => { setDivision(e.target.value as "" | RankingDivision); setPage(1); }}>
              <option value="">All divisions</option>
              {levels.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              <option value="UNKNOWN">{DIVISION_TEXT.UNKNOWN}</option>
            </select>
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={publishedOnly} onChange={(e) => { setPublishedOnly(e.target.checked); setPage(1); }} data-testid="rankings-published-only" />
          Published results only
        </label>
      </div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the ranking" onRetry={() => list.refetch()} /> : (
        <TableCard footer={<Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} />}>
          <thead><tr className="border-b border-gray-100"><th className={th}>Rank</th><th className={th}>Student</th><th className={th}>School</th><th className={th}>Grade</th><th className={th}>Total</th><th className={th}>Status</th></tr></thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="ranking-rows">
            {rows.length === 0 ? <TableMessage colSpan={6}>No approved result yet.</TableMessage> : rows.flatMap((r, i) => [
              ...(by !== "overall" && starts[i] ? [(
                <tr key={`g-${i}`} className="bg-slate-50"><td colSpan={6} className={`${td} text-xs font-bold uppercase tracking-wide text-slate-700`}>{groupLabel(r)}</td></tr>
              )] : []),
              <tr key={r.submissionId} className="text-sm" data-testid={`ranking-${r.student.id}`}>
                <td className={`${td} font-bold text-gray-900`} data-testid="rank">{rankText(rows, i)}</td>
                <td className={`${td} font-semibold text-gray-900`}><StudentName student={r.student} /></td>
                <td className={`${td} text-gray-700`}>{r.school?.name ?? "—"}</td>
                <td className={`${td} text-gray-700`}>{r.student.gradeLevel ?? "—"}</td>
                <td className={`${td} font-semibold`}>{scoreText(r.totalMarks, list.data.test.maxMarks)}</td>
                <td className={td}><SubmissionStatusBadge status={r.status} /></td>
              </tr>,
            ])}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}

// ── Results and report ────────────────────────────────────────────────────────

export function ResultsReportPanel({ testId }: { testId: string }) {
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<ExportType | null>(null);
  const rf = publishedOnly ? { published: true } : {};
  const report = useQuery({ queryKey: queryKeys.tests.report(testId, rf), queryFn: () => testResultsApi.report(testId, rf) });
  const lf = { ...rf, ...(q && { q }), page, limit: 25 };
  const list = useQuery({ queryKey: queryKeys.tests.results(testId, lf), queryFn: () => testResultsApi.list(testId, lf), placeholderData: keepPreviousData });
  const exportCsv = async (type: ExportType) => {
    setExporting(type);
    setExportError(null);
    try { await testResultsApi.exportCsv(testId, { type, ...rf }); } catch (e) { setExportError(errorMessage(e)); } finally { setExporting(null); }
  };
  return (
    <div className="space-y-6" data-testid="results-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Results</h3>
          <p className="mt-0.5 text-xs text-slate-700">Final, approved results (published or not), with identity.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={publishedOnly} onChange={(e) => { setPublishedOnly(e.target.checked); setPage(1); }} data-testid="results-published-only" />
          Published results only
        </label>
      </div>
      {report.isPending ? <LoadingBlock /> : report.isError ? <ErrorState error={report.error} title="Couldn't load the report" onRetry={() => report.refetch()} /> : (() => {
        const r = report.data;
        const widths = barWidths(r.distribution.map((b) => b.count));
        return (
          <div className="space-y-6" data-testid="results-report">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <MetricCard label="Results" value={<span data-testid="report-results">{r.summary.results}</span>} subtext={`${r.counts.published} published`} />
              <MetricCard label="Average" value={<span data-testid="report-average">{statText(r.summary.average)}</span>} subtext={`of ${r.summary.maxMarks}`} />
              <MetricCard label="Median" value={statText(r.summary.median)} />
              <MetricCard label="Lowest" value={statText(r.summary.min)} />
              <MetricCard label="Highest" value={statText(r.summary.max)} />
            </div>
            <section aria-labelledby="dist-h">
              <h4 id="dist-h" className="mb-2 text-sm font-bold text-slate-900">Distribution (percentage of the maximum)</h4>
              <ul className="space-y-1" data-testid="distribution">
                {r.distribution.map((b, i) => (
                  <li key={b.from} className="flex items-center gap-2 text-xs text-slate-800">
                    <span className="w-16 shrink-0 text-right">{b.from}–{b.to}%</span>
                    <span className="h-3 flex-1 rounded bg-slate-100" aria-hidden="true"><span className="block h-3 rounded bg-indigo-600" style={{ width: `${widths[i]}%` }} /></span>
                    <span className="w-10 shrink-0 font-semibold">{b.count}</span>
                  </li>
                ))}
              </ul>
            </section>
            {r.questions.length > 0 && (
              <section aria-labelledby="perq-h">
                <h4 id="perq-h" className="mb-2 text-sm font-bold text-slate-900">Per question</h4>
                <TableCard>
                  <thead><tr className="border-b border-gray-100"><th className={th}>Question</th><th className={th}>Maximum</th><th className={th}>Average</th><th className={th}>Lowest</th><th className={th}>Highest</th></tr></thead>
                  <tbody className="divide-y divide-gray-100/80" data-testid="question-averages">
                    {r.questions.map((x) => (
                      <tr key={x.id} className="text-sm"><td className={td}>{x.order}</td><td className={td}>{x.maxMarks}</td><td className={`${td} font-semibold`}>{statText(x.average)}</td><td className={td}>{statText(x.min)}</td><td className={td}>{statText(x.max)}</td></tr>
                    ))}
                  </tbody>
                </TableCard>
              </section>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section aria-labelledby="bys-h">
                <h4 id="bys-h" className="mb-2 text-sm font-bold text-slate-900">By school</h4>
                <TableCard>
                  <thead><tr className="border-b border-gray-100"><th className={th}>School</th><th className={th}>Results</th><th className={th}>Average</th><th className={th}>Highest</th></tr></thead>
                  <tbody className="divide-y divide-gray-100/80" data-testid="by-school">
                    {r.bySchool.length === 0 ? <TableMessage colSpan={4}>No result yet.</TableMessage> : r.bySchool.map((x) => (
                      <tr key={x.schoolId ?? "none"} className="text-sm"><td className={td}>{x.schoolName ?? "No school"}</td><td className={td}>{x.results}</td><td className={`${td} font-semibold`}>{statText(x.average)}</td><td className={td}>{statText(x.max)}</td></tr>
                    ))}
                  </tbody>
                </TableCard>
              </section>
              <section aria-labelledby="byd-h">
                <h4 id="byd-h" className="mb-2 text-sm font-bold text-slate-900">By division</h4>
                <TableCard>
                  <thead><tr className="border-b border-gray-100"><th className={th}>Division</th><th className={th}>Results</th><th className={th}>Average</th><th className={th}>Highest</th></tr></thead>
                  <tbody className="divide-y divide-gray-100/80" data-testid="by-division">
                    {r.byDivision.length === 0 ? <TableMessage colSpan={4}>No result yet.</TableMessage> : r.byDivision.map((x) => (
                      <tr key={x.division} className="text-sm"><td className={td}><LevelName code={x.division} /></td><td className={td}>{x.results}</td><td className={`${td} font-semibold`}>{statText(x.average)}</td><td className={td}>{statText(x.max)}</td></tr>
                    ))}
                  </tbody>
                </TableCard>
              </section>
            </div>
          </div>
        );
      })()}

      <section aria-labelledby="export-h">
        <h4 id="export-h" className="mb-2 text-sm font-bold text-slate-900">Export (CSV)</h4>
        {exportError && <Alert tone="error">{exportError}</Alert>}
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((x) => (
            <button key={x.type} type="button" className={btnSecondary} disabled={exporting !== null} onClick={() => exportCsv(x.type)} data-testid={`export-${x.type}`}>
              {exporting === x.type ? "Preparing…" : x.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="list-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 id="list-h" className="text-sm font-bold text-slate-900">Results by student</h4>
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name, username or code" label="Search results" />
        </div>
        {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the results" onRetry={() => list.refetch()} /> : list.data.data.length === 0 && !q ? (
          <EmptyState title="No approved result yet" description="Approved results appear here; students see them only once published." />
        ) : (
          <TableCard footer={<Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} />}>
            <thead><tr className="border-b border-gray-100"><th className={th}>Student</th><th className={th}>School</th><th className={th}>Grade</th><th className={th}>Total</th><th className={th}>Status</th><th className={th}>Published</th></tr></thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="result-rows">
              {list.data.data.length === 0 ? <TableMessage colSpan={6}>No match.</TableMessage> : list.data.data.map((x) => (
                <tr key={x.id} className="text-sm" data-testid={`result-${x.student.id}`}>
                  <td className={`${td} font-semibold text-gray-900`}><StudentName student={x.student} /> <span className="block font-mono text-xs font-normal text-gray-600">{x.publicCode}</span></td>
                  <td className={`${td} text-gray-700`}>{x.student.school?.name ?? "—"}</td>
                  <td className={`${td} text-gray-700`}>{x.student.gradeLevel ?? "—"}</td>
                  <td className={`${td} font-semibold`}>{scoreText(x.totalMarks, x.maxMarks)}</td>
                  <td className={td}><SubmissionStatusBadge status={x.status} />{x.withdrawals > 0 && <span className="block text-xs text-gray-600">withdrawn {x.withdrawals}×</span>}</td>
                  <td className={`${td} whitespace-nowrap text-gray-700`}>{x.publishedAt ? formatDateTime(x.publishedAt) : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        )}
      </section>
    </div>
  );
}
