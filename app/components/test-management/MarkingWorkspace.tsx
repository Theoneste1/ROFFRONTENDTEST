"use client";

/**
 * The coach's BLIND marking (Test Management Phase 3; capability testMarking, tests.mark):
 *   - MarkingQueue (`/mentor/marking`): the submissions assigned to me — not started / in progress (a draft, or returned
 *     for correction) / marked — with my progress per test;
 *   - MarkingWorkspace (`/mentor/marking/:code`): the page viewer (one page at a time, previous / next), the paper and the
 *     marking guide, and the marks form (per question with comments, or one total), save as draft, submit for approval.
 * Only the opaque submission code is ever shown: the backend never sends a name, school, submitter or extension mark, and
 * files arrive under neutral names (page-1.jpg). Every request is checked by the backend (authorisation AND assignment).
 */
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { markerApi, type MarkerSubmission, type QueueState } from "@/lib/api/test-marking";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import {
  MARKING_STATUS_BADGE, QUEUE_BADGE, QUEUE_FILTERS, draftFrom, draftTotal, markingPageMode, marksBody, marksProblems, marksText,
  type MarksDraft,
} from "@/lib/test-management/marking";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, PageFrame } from "@/app/components/ui/PageFrame";
import { FilterBar } from "@/app/components/ui/FilterBar";
import { ConfirmDialog, MetricCard, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

/** The page when the backend has no marking, or the user cannot mark; otherwise the children. */
export function MarkingGate({ title, children }: { title: string; children: ReactNode }) {
  const { permissionsStatus, can, retry } = useSession();
  const caps = useBackendCapabilities();
  const mode = markingPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  if (mode === "visible") return <>{children}</>;
  return (
    <PageFrame title={title}>
      {mode === "loading" && <LoadingBlock />}
      {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retry} />}
      {mode === "unsupported" && <Notice tone="info">This server does not provide test marking yet.</Notice>}
      {mode === "forbidden" && <Notice tone="info">Marking is for coaches authorised to mark a subject.</Notice>}
    </PageFrame>
  );
}

export function QueueBadge({ state, returned }: { state: QueueState; returned?: boolean }) {
  const b = returned ? { label: "Returned for correction", className: "bg-rose-100 text-rose-900" } : QUEUE_BADGE[state];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${b.className}`} data-testid="queue-badge">{b.label}</span>;
}

// ── The queue ──────────────────────────────────────────────────────────────────

export function MarkingQueue() {
  return (
    <MarkingGate title="Marking">
      <Queue />
    </MarkingGate>
  );
}

function Queue() {
  const [state, setState] = useState<"" | QueueState>("");
  const [testId, setTestId] = useState("");
  const [page, setPage] = useState(1);
  const filters = { state: state || undefined, testId: testId || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.queue(filters), queryFn: () => markerApi.queue(filters), placeholderData: keepPreviousData });
  const c = list.data?.counts;
  return (
    <PageFrame title="Marking" description="Submissions assigned to you. Only a submission code is shown: marking is blind.">
      {c && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="queue-counts">
          <MetricCard label="Assigned to me" value={c.total} />
          <MetricCard label="Not started" value={c.notStarted} />
          <MetricCard label="In progress" value={c.inProgress} />
          <MetricCard label="Marked" value={c.marked} />
        </div>
      )}
      {/* The state tabs, then the test filter (owner 2026-11-25: "+ Add filter" and a chip) when there is more than one test. */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <FilterPills label="State" options={[...QUEUE_FILTERS]} value={state} onChange={(v) => { setState(v); setPage(1); }} />
      </div>
      {((list.data && list.data.tests.length > 1) || testId) && (
        <FilterBar
          testId="queue-filters"
          onClearAll={() => { setTestId(""); setPage(1); }}
          filters={[
            { key: "testId", kind: "select", label: "Test", value: testId, onChange: (v) => { setTestId(v); setPage(1); },
              options: (list.data?.tests ?? []).map((t) => ({ label: `${t.title} (${t.marked}/${t.assigned} marked)`, value: t.id })) },
          ]}
        />
      )}
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load your marking queue" onRetry={() => list.refetch()} /> : list.data.data.length === 0 ? (
        <EmptyState title="Nothing to mark" description={state ? "No submission in this group." : "When submissions are assigned to you, they appear here."} />
      ) : (
        <>
          {/* Phones: cards; from md: a table. */}
          <ul className="grid grid-cols-1 gap-3 md:hidden" data-testid="queue-cards">
            {list.data.data.map((r) => (
              <li key={r.code}>
                <Link href={`/mentor/marking/${r.code}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  data-testid={`queue-card-${r.code}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-base font-bold text-slate-900">{r.code}</p>
                    <QueueBadge state={r.state} returned={r.returned} />
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{r.test.title} · {r.test.subject.name}</p>
                  <p className="mt-2 flex items-center justify-between text-xs text-slate-800">
                    <span>My marks: {marksText(r.myTotal, r.test.maxMarks)}</span>
                    <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <TableCard>
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={th}>Submission</th>
                  <th className={th}>Test</th>
                  <th className={th}>State</th>
                  <th className={th}>My marks</th>
                  <th className={th}>Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80" data-testid="queue-rows">
                {list.data.data.length === 0 ? <TableMessage colSpan={5}>Nothing to mark.</TableMessage> : list.data.data.map((r) => (
                  <tr key={r.code} className="text-xs" data-testid={`queue-${r.code}`}>
                    <td className={td}><Link href={`/mentor/marking/${r.code}`} className="font-mono text-sm font-bold text-indigo-700 hover:underline">{r.code}</Link></td>
                    <td className={`${td} text-gray-800`}>{r.test.title}<span className="block text-gray-600">{r.test.subject.name}</span></td>
                    <td className={td}><QueueBadge state={r.state} returned={r.returned} /></td>
                    <td className={`${td} text-gray-800`}>{marksText(r.myTotal, r.test.maxMarks)}</td>
                    <td className={`${td} text-gray-700`}>{formatDateTime(r.assignedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </div>
          <div className="mt-3">
            <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
          </div>
        </>
      )}
    </PageFrame>
  );
}

// ── One submission ─────────────────────────────────────────────────────────────

export function MarkingWorkspace({ code }: { code: string }) {
  return (
    <MarkingGate title={`Submission ${code}`}>
      <Workspace code={code} />
    </MarkingGate>
  );
}

function Workspace({ code }: { code: string }) {
  const one = useQuery({ queryKey: queryKeys.tests.toMark(code), queryFn: () => markerApi.get(code), retry: false });
  const back = (
    <Link href="/mentor/marking" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Marking queue
    </Link>
  );
  if (one.isPending) return <PageFrame title={`Submission ${code}`}><LoadingBlock /></PageFrame>;
  if (one.isError) {
    const code_ = isApiError(one.error) ? one.error.code : null;
    return (
      <PageFrame title={`Submission ${code}`}>
        {back}
        {code_ === "MARKING_NOT_ASSIGNED" ? <Notice tone="info">This submission is not assigned to you.</Notice>
          : code_ === "MARKER_NOT_AUTHORIZED" ? <Notice tone="info">You are no longer authorised to mark this subject.</Notice>
            : <ErrorState error={one.error} title="Couldn't load the submission" onRetry={() => one.refetch()} />}
      </PageFrame>
    );
  }
  const s = one.data;
  return (
    <PageFrame
      title={`Submission ${s.code}`}
      description={<span className="inline-flex flex-wrap items-center gap-2"><QueueBadge state={s.state} returned={s.myMarking?.status === "RETURNED"} /> {s.test.title} · {s.test.subject.name} · {s.test.maxMarks} marks</span>}
    >
      {back}
      {s.myMarking?.status === "RETURNED" && s.myMarking.returnComment && (
        <div className="mb-4"><Alert tone="error">Returned for correction: “{s.myMarking.returnComment}”</Alert></div>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-labelledby="answer-h" className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <h2 id="answer-h" className="text-base font-bold text-slate-900">Answer</h2>
          {s.answer.typedAnswer && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Typed answer</p>
              <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-900" data-testid="typed-answer-view">{s.answer.typedAnswer}</p>
            </div>
          )}
          {s.answer.pages.length > 0 ? <PageViewer code={s.code} pages={s.answer.pages} /> : !s.answer.typedAnswer && <p className="text-sm text-slate-700">No answer pages.</p>}
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3">
            {s.test.paper && (
              <div><p className="mb-1 text-xs font-semibold text-slate-700">Question paper</p>
                <FileButton file={{ id: `${s.code}-paper`, originalName: s.test.paper.name, mimeType: s.test.paper.mimeType, size: s.test.paper.size }} fetchFile={() => markerApi.paper(s.code)} /></div>
            )}
            {s.test.markingGuide && (
              <div data-testid="marking-guide"><p className="mb-1 text-xs font-semibold text-slate-700">Marking guide</p>
                <FileButton file={{ id: `${s.code}-guide`, originalName: s.test.markingGuide.name, mimeType: s.test.markingGuide.mimeType, size: s.test.markingGuide.size }} fetchFile={() => markerApi.markingGuide(s.code)} /></div>
            )}
          </div>
        </section>
        <MarksForm s={s} />
      </div>
    </PageFrame>
  );
}

/** One page at a time (previous / next); images inline, PDFs open or save. */
function PageViewer({ code, pages }: { code: string; pages: MarkerSubmission["answer"]["pages"] }) {
  const [i, setI] = useState(0);
  const p = pages[Math.min(i, pages.length - 1)];
  const image = p.mimeType.startsWith("image/") && p.mimeType !== "image/heic" && p.mimeType !== "image/heif";
  const blob = useQuery({ queryKey: [...queryKeys.tests.toMark(code), "page", p.page], queryFn: () => markerApi.page(code, p.page), enabled: image, staleTime: 300_000 });
  // A private object URL per fetched page, released when the page changes or the viewer closes.
  const url = useMemo(() => (blob.data ? URL.createObjectURL(blob.data.blob) : null), [blob.data]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div data-testid="page-viewer">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" className={btnSecondary} onClick={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-slate-800" aria-live="polite" data-testid="page-position">Page {p.page} of {pages.length}</p>
        <button type="button" className={btnSecondary} onClick={() => setI((x) => Math.min(pages.length - 1, x + 1))} disabled={i >= pages.length - 1} aria-label="Next page">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {image ? (
        blob.isPending ? <LoadingBlock /> : blob.isError ? <ErrorState error={blob.error} title="Couldn't load the page" onRetry={() => blob.refetch()} /> : url && (
          // eslint-disable-next-line @next/next/no-img-element -- a private blob: URL, not an optimisable asset
          <img src={url} alt={`Answer page ${p.page} of ${pages.length}`} className="mx-auto max-h-[70vh] w-auto rounded-lg border border-slate-200 object-contain" data-testid="page-image" />
        )
      ) : <p className="text-sm text-slate-700">This page is a {p.mimeType === "application/pdf" ? "PDF" : "file"}: open or save it.</p>}
      <div className="mt-2"><FileButton file={{ id: `${code}-${p.page}`, originalName: p.name, mimeType: p.mimeType, size: p.size }} fetchFile={() => markerApi.page(code, p.page)} /></div>
    </div>
  );
}

function MarksForm({ s }: { s: MarkerSubmission }) {
  const ids = useId();
  const qc = useQueryClient();
  const questions = s.test.questions;
  const initial = useMemo(() => draftFrom(questions, s.myMarking), [questions, s.myMarking]);
  const [d, setD] = useState<MarksDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const disabled = !s.canEdit;
  const total = draftTotal(questions, d);
  const apply = (x: MarkerSubmission, message: string) => {
    qc.setQueryData(queryKeys.tests.toMark(s.code), x);
    void qc.invalidateQueries({ queryKey: queryKeys.tests.all, predicate: (q) => q.queryKey.includes("queue") });
    setNotice(message);
  };
  const save = useMutation({
    mutationFn: () => markerApi.save(s.code, marksBody(questions, d)),
    onSuccess: (x) => apply(x, `Draft saved ${formatDateTime(x.myMarking?.savedAt ?? new Date().toISOString())}.`),
    onError: (e) => setError(errorMessage(e)),
  });
  function onSave(e: FormEvent) {
    e.preventDefault();
    const p = marksProblems(questions, s.test.maxMarks, d, false);
    setErrors(p);
    setNotice(null);
    if (Object.keys(p).length) return;
    setError(null);
    save.mutate();
  }
  function onSubmit() {
    const p = marksProblems(questions, s.test.maxMarks, d, true);
    setErrors(p);
    setNotice(null);
    if (Object.keys(p).length) return setError("Give marks for every question before submitting.");
    setError(null);
    setConfirm(true);
  }
  const field = (key: string) => (errors[key] ? inputBad : inputOk);
  return (
    <section aria-labelledby={`${ids}-h`} className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <form onSubmit={onSave} noValidate className="space-y-4" data-testid="marks-form">
        <div className="flex items-start justify-between gap-2">
          <h2 id={`${ids}-h`} className="text-base font-bold text-slate-900">Marks</h2>
          {s.myMarking && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${MARKING_STATUS_BADGE[s.myMarking.status].className}`}>{MARKING_STATUS_BADGE[s.myMarking.status].label}</span>}
        </div>
        {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
        {error && <Alert tone="error">{error}</Alert>}
        {!s.canEdit && <p className="text-sm text-slate-700">Submitted for approval: your marks can no longer change unless a reviewer returns them.</p>}
        {questions.length === 0 ? (
          <div className="max-w-[12rem]">
            <label htmlFor={`${ids}-total`} className={labelCls}>Total marks (of {s.test.maxMarks})</label>
            <input id={`${ids}-total`} inputMode="numeric" className={`${inputCls} ${field("total")}`} value={d.total} disabled={disabled}
              onChange={(e) => setD((x) => ({ ...x, total: e.target.value }))} aria-invalid={!!errors.total} aria-describedby={errors.total ? `${ids}-total-e` : undefined}
              data-testid="total-marks" />
            {errors.total && <p id={`${ids}-total-e`} className="mt-1 text-xs text-red-700">{errors.total}</p>}
          </div>
        ) : (
          <ol className="space-y-3" data-testid="question-marks">
            {questions.map((q) => {
              const k = `q:${q.id}`;
              const v = d.scores[q.id] ?? { marks: "", comment: "" };
              const set = (patch: Partial<typeof v>) => setD((x) => ({ ...x, scores: { ...x.scores, [q.id]: { ...v, ...patch } } }));
              return (
                <li key={q.id} className="rounded-xl border border-slate-200 p-3" data-testid={`mark-q${q.order}`}>
                  <p className="text-sm text-slate-900"><span className="font-bold">{q.order}.</span> <span className="whitespace-pre-wrap">{q.prompt}</span></p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <div>
                      <label htmlFor={`${ids}-${q.id}-m`} className="block text-xs font-semibold text-slate-700">Marks (of {q.maxMarks})</label>
                      <input id={`${ids}-${q.id}-m`} inputMode="numeric" className={`${inputCls} ${field(k)}`} value={v.marks} disabled={disabled}
                        onChange={(e) => set({ marks: e.target.value })} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `${ids}-${q.id}-e` : undefined} />
                      {errors[k] && <p id={`${ids}-${q.id}-e`} className="mt-1 text-xs text-red-700">{errors[k]}</p>}
                    </div>
                    <div>
                      <label htmlFor={`${ids}-${q.id}-c`} className="block text-xs font-semibold text-slate-700">Comment (optional)</label>
                      <textarea id={`${ids}-${q.id}-c`} rows={2} maxLength={2000} className={`${inputCls} ${inputOk}`} value={v.comment} disabled={disabled}
                        onChange={(e) => set({ comment: e.target.value })} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div>
          <label htmlFor={`${ids}-comment`} className={labelCls}>Overall comment (optional)</label>
          <textarea id={`${ids}-comment`} rows={3} maxLength={2000} className={`${inputCls} ${field("comment")}`} value={d.comment} disabled={disabled}
            onChange={(e) => setD((x) => ({ ...x, comment: e.target.value }))} />
        </div>
        <p className="text-sm font-semibold text-slate-900" data-testid="running-total" aria-live="polite">Total: {marksText(total, s.test.maxMarks)}</p>
        {s.canEdit && (
          <div className="flex flex-wrap justify-end gap-3">
            <button type="submit" className={btnSecondary} disabled={save.isPending} data-testid="save-draft">{save.isPending ? "Saving…" : "Save draft"}</button>
            <button type="button" className={btnPrimary} onClick={onSubmit} data-testid="submit-marking">Submit for approval</button>
          </div>
        )}
      </form>
      {confirm && (
        <ConfirmDialog
          title="Submit your marking?"
          body={<>Total {marksText(total, s.test.maxMarks)}. After submitting, your marks can change only if a reviewer returns them.</>}
          confirmLabel="Submit"
          onConfirm={async () => apply(await markerApi.submit(s.code, marksBody(questions, d)), "Submitted for approval.")}
          onClose={() => setConfirm(false)}
        />
      )}
    </section>
  );
}
