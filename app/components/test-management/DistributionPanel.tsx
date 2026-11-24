"use client";

/**
 * Markers & distribution (Test Management Phase 3; tests.distribute — Administrators, the subject's Head Coaches):
 * the submissions by status, how many may be distributed now and how many wait for their latest deadline (G5: never
 * before every applicable deadline, extensions included — the backend decides), even automatic distribution between the
 * chosen authorised coaches, manual assignment and reassignment (mandatory reason), and each coach's progress.
 */
import { useId, useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { testMarkingApi, type MarkingOverview, type ReviewRow } from "@/lib/api/test-marking";
import type { SubmissionStatus } from "@/lib/api/test-submissions";
import { errorMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { SUBMISSION_STATUS_LABEL, newClientKey } from "@/lib/test-management/submissions";
import { STATUS_BADGE, evenShareText, reasonProblem } from "@/lib/test-management/marking";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { MetricCard, Modal, Notice, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "@/app/admin/components/adminUi";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";
import StudentName from "@/app/components/students/StudentName";

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[status]}`} data-testid="submission-status">{SUBMISSION_STATUS_LABEL[status]}</span>;
}

/** Authorised coaches of the test's subject (for every coach picker). */
export function useMarkingOverview(testId: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.tests.marking(testId), queryFn: () => testMarkingApi.overview(testId), enabled });
}

export default function DistributionPanel({ testId }: { testId: string }) {
  const qc = useQueryClient();
  const overview = useMarkingOverview(testId);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.tests.marking(testId) });

  if (overview.isPending) return <LoadingBlock />;
  if (overview.isError) return <ErrorState error={overview.error} title="Couldn't load the marking overview" onRetry={() => overview.refetch()} />;
  const o = overview.data;
  const by = o.counts.byStatus;
  return (
    <div className="space-y-6" data-testid="distribution-panel">
      <div>
        <h3 className="text-base font-bold text-slate-900">Distribution</h3>
        <p className="mt-0.5 text-xs text-slate-700">
          Submissions are given to coaches authorised to mark {o.test.subject.name}, only once every deadline that applies to them has passed
          (extensions included). Markers see a submission code, never the student.
        </p>
      </div>
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="distribution-counts">
        <MetricCard label="Submissions" value={o.counts.total} />
        <MetricCard label="Ready to distribute" value={o.distribution.readyToAssign} />
        <MetricCard label="Waiting for a deadline" value={o.distribution.waitingForDeadline}
          subtext={o.distribution.nextEligibleAt ? `next markable after ${formatDateTime(o.distribution.nextEligibleAt)}` : undefined} />
        <MetricCard label="Approved" value={by.APPROVED ?? 0} subtext={`${by.MARKED ?? 0} awaiting approval`} />
      </div>
      <AutoDistribute o={o} onDone={(m) => { setNotice(m); void refresh(); void qc.invalidateQueries({ queryKey: queryKeys.tests.all, predicate: (q) => q.queryKey.includes("review") }); }} />
      <CoachProgress o={o} />
      <Assignments testId={testId} o={o} onDone={(m) => { setNotice(m); void qc.invalidateQueries({ queryKey: queryKeys.tests.marking(testId) }); }} />
    </div>
  );
}

function AutoDistribute({ o, onDone }: { o: MarkingOverview; onDone: (message: string) => void }) {
  const ids = useId();
  const authorised = o.coaches.filter((c) => c.authorised);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => newClientKey());
  const run = useMutation({
    mutationFn: () => testMarkingApi.distribute(o.test.id, { coachIds: chosen, clientKey: key }),
    onSuccess: (r) => onDone(r.assigned === 0
      ? `Nothing was distributed${r.waitingForDeadline ? `: ${r.waitingForDeadline} submission(s) still wait for their deadline` : ""}.`
      : `${r.assigned} submission(s) distributed: ${r.coaches.filter((c) => c.assigned > 0).map((c) => `${c.assigned}`).join(", ")} per coach.`),
    onError: (e) => setError(errorMessage(e)),
  });
  const toggle = (id: string) => setChosen((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <section aria-labelledby={`${ids}-h`} className="rounded-xl border border-slate-200 p-4">
      <h4 id={`${ids}-h`} className="text-sm font-bold text-slate-900">Distribute evenly</h4>
      {authorised.length === 0 ? (
        <p className="mt-1 text-sm text-slate-700">No coach is authorised to mark {o.test.subject.name} yet: authorise coaches below first.</p>
      ) : (
        <>
          <fieldset className="mt-2">
            <legend className="text-xs font-semibold text-slate-700">Coaches to share the ready submissions between</legend>
            <div className="mt-1 flex flex-wrap gap-2" data-testid="distribute-coaches">
              {authorised.map((c) => (
                <label key={c.coach.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900">
                  <input type="checkbox" checked={chosen.includes(c.coach.id)} onChange={() => toggle(c.coach.id)} />
                  {personName(c.coach)} <span className="text-xs text-slate-600">({c.assigned} now)</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-2 text-xs text-slate-700" data-testid="even-share">{evenShareText(o.distribution.readyToAssign, chosen.length)}</p>
          {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
          <button type="button" className={`${btnPrimary} mt-3`} disabled={chosen.length === 0 || run.isPending} onClick={() => { setError(null); run.mutate(); }} data-testid="distribute">
            {run.isPending ? "Distributing…" : "Distribute"}
          </button>
        </>
      )}
    </section>
  );
}

function CoachProgress({ o }: { o: MarkingOverview }) {
  return (
    <section aria-label="Progress per coach">
      <h4 className="mb-2 text-sm font-bold text-slate-900">Progress per coach</h4>
      <TableCard>
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>Coach</th>
            <th className={th}>Assigned</th>
            <th className={th}>Not started</th>
            <th className={th}>In progress</th>
            <th className={th}>Marked</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100/80" data-testid="coach-progress">
          {o.coaches.length === 0 ? <TableMessage colSpan={5}>No coach yet.</TableMessage> : o.coaches.map((c) => (
            <tr key={c.coach.id} className="text-xs" data-testid={`progress-${c.coach.username}`}>
              <td className={td}>
                <span className="font-semibold text-gray-900">{personName(c.coach)}</span>
                {!c.authorised && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-800">not authorised</span>}
                {c.secondMarkings > 0 && <span className="block text-gray-600">{c.secondMarkings} second marking(s)</span>}
              </td>
              <td className={`${td} text-gray-800`}>{c.assigned}</td>
              <td className={`${td} text-gray-800`}>{c.notStarted}</td>
              <td className={`${td} text-gray-800`}>{c.inProgress}</td>
              <td className={`${td} text-gray-800`}>{c.marked}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </section>
  );
}

const ASSIGN_FILTERS: ReadonlyArray<{ label: string; value: SubmissionStatus }> = [
  { label: "Not assigned", value: "SUBMITTED" },
  { label: "Assigned", value: "ASSIGNED" },
  { label: "Marking", value: "MARKING_IN_PROGRESS" },
  { label: "Returned", value: "RETURNED" },
  { label: "Second marking", value: "AWAITING_SECOND_MARKING" },
];

/** Manual assignment (ready, unassigned submissions) and reassignment (a marking not submitted yet). */
function Assignments({ testId, o, onDone }: { testId: string; o: MarkingOverview; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<SubmissionStatus>("SUBMITTED");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [reassigning, setReassigning] = useState<ReviewRow | null>(null);
  const filters = { status, q: q || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.review(testId, { ...filters, for: "assign" }), queryFn: () => testMarkingApi.list(testId, filters), placeholderData: keepPreviousData });
  const after = (m: string) => {
    setPicked([]);
    void qc.invalidateQueries({ queryKey: queryKeys.tests.all, predicate: (x) => x.queryKey.includes("marking") });
    onDone(m);
  };
  const markable = (list.data?.data ?? []).filter((r) => r.status === "SUBMITTED" && r.markable);
  return (
    <section aria-label="Assign and reassign" className="space-y-3">
      <h4 className="text-sm font-bold text-slate-900">Assign and reassign</h4>
      <FilterPills label="Submissions" options={ASSIGN_FILTERS.map((f) => ({ ...f, count: list.data?.counts[f.value] }))} value={status}
        onChange={(v) => { setStatus(v); setPage(1); setPicked([]); }} />
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search students or codes" label="Search submissions" />
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the submissions" onRetry={() => list.refetch()} /> : (
        <>
          {status === "SUBMITTED" && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={btnSecondary} disabled={picked.length === 0} onClick={() => setAssigning(true)} data-testid="assign-selected">
                Assign selected ({picked.length})
              </button>
              {markable.length > 0 && (
                <button type="button" className={linkBtn} onClick={() => setPicked(markable.map((r) => r.id))}>Select all ready on this page</button>
              )}
            </div>
          )}
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                {status === "SUBMITTED" && <th className={th}><span className="sr-only">Select</span></th>}
                <th className={th}>Student</th>
                <th className={th}>Code</th>
                <th className={th}>Status</th>
                <th className={th}>Marker</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="assign-rows">
              {list.data.data.length === 0 ? <TableMessage colSpan={6}>No submission here.</TableMessage> : list.data.data.map((r) => (
                <tr key={r.id} className="text-xs" data-testid={`assign-${r.student.username}`}>
                  {status === "SUBMITTED" && (
                    <td className={td}>
                      <input type="checkbox" disabled={!r.markable} checked={picked.includes(r.id)} aria-label={`Select ${personName(r.student)}`}
                        onChange={() => setPicked((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))} />
                    </td>
                  )}
                  <td className={td}><span className="font-semibold text-gray-900"><StudentName student={r.student} /></span>{r.student.school && <span className="block text-gray-600">{r.student.school.name}</span>}</td>
                  <td className={`${td} font-mono text-gray-800`}>{r.publicCode}</td>
                  <td className={td}>
                    <SubmissionStatusBadge status={r.status} />
                    {r.status === "SUBMITTED" && !r.markable && r.markableAfter && <span className="block text-gray-700">markable after {formatDateTime(r.markableAfter)}</span>}
                  </td>
                  <td className={`${td} text-gray-800`}>
                    {r.firstMarker ? personName(r.firstMarker) : "—"}
                    {r.secondMarker && <span className="block text-gray-600">second: {personName(r.secondMarker)}</span>}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {r.status !== "SUBMITTED" && <button type="button" className={linkBtn} onClick={() => setReassigning(r)} aria-label={`Reassign ${personName(r.student)}`}>Reassign</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
      {assigning && (
        <CoachDialog o={o} title={`Assign ${picked.length} submission(s)`} reasonRequired={false} confirmLabel="Assign"
          onSubmit={async (coachId, reason) => {
            const r = await testMarkingApi.assign(testId, { submissionIds: picked, coachId, ...(reason && { reason }) });
            after(`${r.assigned} assigned${r.alreadyAssigned ? ` (${r.alreadyAssigned} already with this coach)` : ""}.`);
          }}
          onClose={() => setAssigning(false)} />
      )}
      {reassigning && (
        <CoachDialog o={o} title={`Reassign ${personName(reassigning.student)} (${reassigning.publicCode})`} reasonRequired confirmLabel="Reassign"
          kinds={reassigning.secondMarker ? ["FIRST", "SECOND"] : ["FIRST"]}
          exclude={[reassigning.firstMarker?.id, reassigning.secondMarker?.id].filter((x): x is string => !!x)}
          onSubmit={async (coachId, reason, kind) => {
            await testMarkingApi.reassign(testId, reassigning.id, { coachId, reason, kind });
            after("Reassigned. The new coach starts afresh; the previous coach no longer sees it.");
          }}
          onClose={() => setReassigning(null)} />
      )}
    </section>
  );
}

/** Pick an authorised coach (and, for a reassignment, which marking and a mandatory reason). */
export function CoachDialog({ o, title, confirmLabel, reasonRequired, kinds, exclude = [], onSubmit, onClose }: {
  o: MarkingOverview; title: string; confirmLabel: string; reasonRequired: boolean; kinds?: Array<"FIRST" | "SECOND">; exclude?: string[];
  onSubmit: (coachId: string, reason: string, kind?: "FIRST" | "SECOND") => Promise<void>; onClose: () => void;
}) {
  const ids = useId();
  const coaches = o.coaches.filter((c) => c.authorised && !exclude.includes(c.coach.id));
  const [coachId, setCoachId] = useState("");
  const [kind, setKind] = useState<"FIRST" | "SECOND">(kinds?.[0] ?? "FIRST");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ coach?: string; reason?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const p: typeof errors = {};
    if (!coachId) p.coach = "Choose a coach.";
    const rp = reason.trim() || reasonRequired ? reasonProblem(reason) : null;
    if (rp) p.reason = rp;
    setErrors(p);
    if (Object.keys(p).length) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(coachId, reason.trim(), kinds ? kind : undefined);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={busy ? () => undefined : onClose}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="coach-dialog">
        {error && <Alert tone="error">{error}</Alert>}
        {kinds && kinds.length > 1 && (
          <SelectFilter label="Marking" value={kind} onChange={(v) => setKind(v as "FIRST" | "SECOND")}
            options={[{ label: "First marking", value: "FIRST" }, { label: "Second marking", value: "SECOND" }]} />
        )}
        <div>
          <label htmlFor={`${ids}-coach`} className={labelCls}>Coach</label>
          <select id={`${ids}-coach`} className={`${inputCls} ${errors.coach ? inputBad : inputOk}`} value={coachId} onChange={(e) => setCoachId(e.target.value)}
            aria-invalid={!!errors.coach} aria-describedby={errors.coach ? `${ids}-coach-e` : undefined} data-testid="coach-select">
            <option value="">Choose an authorised coach…</option>
            {coaches.map((c) => <option key={c.coach.id} value={c.coach.id}>{personName(c.coach)} ({c.assigned} assigned)</option>)}
          </select>
          {errors.coach && <p id={`${ids}-coach-e`} className="mt-1 text-xs text-red-700">{errors.coach}</p>}
        </div>
        <div>
          <label htmlFor={`${ids}-reason`} className={labelCls}>Reason {reasonRequired ? <span className="text-amber-600">*</span> : <span className="font-normal text-slate-600">(optional)</span>}</label>
          <textarea id={`${ids}-reason`} rows={3} maxLength={500} className={`${inputCls} ${errors.reason ? inputBad : inputOk}`} value={reason}
            onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? `${ids}-reason-e` : undefined} data-testid="coach-reason" />
          {errors.reason && <p id={`${ids}-reason-e`} className="mt-1 text-xs text-red-700">{errors.reason}</p>}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={busy} data-testid="coach-confirm">{busy ? "Saving…" : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
