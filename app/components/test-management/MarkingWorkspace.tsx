"use client";

/**
 * The coach's BLIND marking (Test Management Phase 3; capability testMarking, tests.mark; design approved 2026-11-26):
 *   - MarkingQueue (`/mentor/marking`): my numbers (the coach dashboard), my tests as pills (how many papers are left to
 *     mark in each), the papers assigned to me with their status, my marks and the next action;
 *   - MarkingWorkspace (`/mentor/marking/:code`): a split screen — the whole answer paper on the left (PaperViewer), the
 *     marks panel on the right (collapsible): the paper card, what I am marking and my progress, one card per question
 *     (quick score buttons, the number field, a comment), save as draft, submit for approval; "Next paper".
 * Only the opaque paper code is ever shown: the backend never sends a name, school, submitter or extension mark, and
 * files arrive under neutral names (page-1.jpg). Every request is checked by the backend (authorisation AND assignment).
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, PanelRightClose, PanelRightOpen } from "lucide-react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { markerApi, type MarkerSubmission, type QueueItem, type QueuePage, type QueueState } from "@/lib/api/test-marking";
import { coachDashboardApi, type CoachDashboard } from "@/lib/api/test-results";
import { UserFacingError, errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import { QUEUE_FILTERS, draftFrom, draftTotal, markingPageMode, marksBody, marksProblems, marksText, parseWhole, type MarksDraft } from "@/lib/test-management/marking";
import { MY_MARKING_STATUS, queueStatus } from "@/lib/test-management/marking-status";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { FilterBar } from "@/app/components/ui/FilterBar";
import { ConfirmDialog, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { MarkingStatusBadge } from "@/app/components/marking/MarkingStatusBadge";
import { StatTile } from "@/app/components/marking/StatTile";
import { PaperViewer } from "@/app/components/marking/PaperViewer";
import { CoachQuestionCard, MISSING_MARKS } from "@/app/components/marking/CoachQuestionCard";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

const BRAND = "#00428C";
const backLink = "inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-[#00428C] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C]";

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

/** A paper's status in my queue (badge + icon + words; one system for every marking screen). */
export function QueueBadge({ state, returned }: { state: QueueState; returned?: boolean }) {
  return <MarkingStatusBadge status={queueStatus(state, !!returned)} testId="queue-badge" />;
}

/** "question 2", "questions 2 and 4", "questions 1, 2 and 4". */
function questionList(orders: readonly number[]): string {
  if (orders.length === 1) return `question ${orders[0]}`;
  return `questions ${orders.slice(0, -1).join(", ")} and ${orders[orders.length - 1]}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ── The queue ──────────────────────────────────────────────────────────────────

export function MarkingQueue() {
  return (
    <MarkingGate title="Marking">
      <Queue />
    </MarkingGate>
  );
}

/** The state filter's words (a submitted paper is "Submitted", as on its badge). */
const STATE_OPTIONS = QUEUE_FILTERS.filter((o) => o.value !== "").map((o) => ({ label: o.value === "MARKED" ? "Submitted" : o.label, value: o.value }));

function Queue() {
  const [state, setState] = useState<"" | QueueState>("");
  const [testId, setTestId] = useState("");
  const [page, setPage] = useState(1);
  const filters = { state: state || undefined, testId: testId || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.queue(filters), queryFn: () => markerApi.queue(filters), placeholderData: keepPreviousData });
  const dash = useQuery({ queryKey: queryKeys.tests.dashboard("coach"), queryFn: coachDashboardApi.dashboard, retry: false });
  const filtered = !!state || !!testId;
  return (
    <PageFrame title="Marking" description="The papers assigned to you. Marking is blind: you see a paper code, never the student.">
      <QueueStats dash={dash.data} counts={dash.isError ? list.data?.counts : undefined} />
      {list.data && list.data.tests.length > 0 && (
        <TestPills tests={list.data.tests} value={testId} onChange={(v) => { setTestId(v); setPage(1); }} />
      )}
      <FilterBar
        testId="queue-filters"
        onClearAll={() => { setState(""); setTestId(""); setPage(1); }}
        filters={[
          { key: "state", kind: "select", label: "Status", value: state, onChange: (v) => { setState(v as "" | QueueState); setPage(1); }, options: STATE_OPTIONS },
          // Chosen with the test pills above; shown here as a chip (removable) once chosen.
          { key: "testId", kind: "select", label: "Test", value: testId, show: false, onChange: (v) => { setTestId(v); setPage(1); },
            options: (list.data?.tests ?? []).map((t) => ({ label: t.title, value: t.id })) },
        ]}
      />
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load your marking queue" onRetry={() => list.refetch()} /> : list.data.data.length === 0 ? (
        <EmptyState
          title="Nothing to mark"
          description={filtered ? "No paper matches these filters. Clear the filters to see every paper assigned to you." : "No paper is assigned to you yet. When the Head Coach assigns papers to you, they appear here."}
        />
      ) : (
        <>
          {/* Phones: cards; from md: a table. */}
          <ul className="grid grid-cols-1 gap-3 md:hidden" data-testid="queue-cards">
            {list.data.data.map((r) => {
              const a = queueAction(r);
              return (
                <li key={r.code}>
                  <Link href={`/mentor/marking/${r.code}`} className="block rounded-xl border border-gray-100 bg-white p-4 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C]"
                    data-testid={`queue-card-${r.code}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-base font-bold text-[#00428C]">{r.code}</p>
                      <QueueBadge state={r.state} returned={r.returned} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-gray-900">{r.test.title}</p>
                    <p className="text-xs text-gray-600">{r.test.subject.name} · assigned {formatDateTime(r.assignedAt)}</p>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-800">
                      <span>My marks: <MyMarks r={r} /></span>
                      <span className={`${a.className} pointer-events-none`}>{a.label} <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <TableCard>
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={th}>Paper</th>
                  <th className={th}>Test</th>
                  <th className={th}>Status</th>
                  <th className={th}>My marks</th>
                  <th className={th}>Assigned</th>
                  <th className={`${th} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80" data-testid="queue-rows">
                {list.data.data.length === 0 ? <TableMessage colSpan={6}>Nothing to mark.</TableMessage> : list.data.data.map((r) => {
                  const a = queueAction(r);
                  return (
                    <tr key={r.code} className="text-sm" data-testid={`queue-${r.code}`}>
                      <td className={td}>
                        <Link id={`paper-${r.code}`} href={`/mentor/marking/${r.code}`} className="rounded font-mono text-sm font-bold text-[#00428C] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C]">{r.code}</Link>
                      </td>
                      <td className={`${td} text-gray-900`}>{r.test.title}<span className="block text-xs text-gray-600">{r.test.subject.name}</span></td>
                      <td className={td}><QueueBadge state={r.state} returned={r.returned} /></td>
                      <td className={`${td} whitespace-nowrap text-gray-900`}><MyMarks r={r} /></td>
                      <td className={`${td} whitespace-nowrap text-gray-700`}>{formatDateTime(r.assignedAt)}</td>
                      <td className={`${td} text-right`}>
                        <Link href={`/mentor/marking/${r.code}`} className={a.className} aria-describedby={`paper-${r.code}`} data-testid={`queue-action-${r.code}`}>{a.label}</Link>
                      </td>
                    </tr>
                  );
                })}
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

/** The five numbers (the coach dashboard); without it, the queue's own four (no "Returned"). */
function QueueStats({ dash, counts }: { dash?: CoachDashboard; counts?: QueuePage["counts"] }) {
  if (dash) {
    const c = dash.counts;
    return (
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="queue-counts">
        <StatTile label="Assigned to me" value={c.total} hint={plural(dash.tests.length, "test")} testId="stat-assigned" />
        <StatTile label="Not started" value={c.notStarted} hint="ready to mark" testId="stat-not-started" />
        <StatTile label="In progress" value={Math.max(0, c.inProgress - c.returned)} hint="drafts saved" tone="blue" testId="stat-in-progress" />
        <StatTile label="Returned to you" value={c.returned} hint="needs correction" tone="red" testId="stat-returned" />
        <StatTile label="Submitted" value={c.marked} hint="to the Head Coach" tone="indigo" testId="stat-submitted" />
      </div>
    );
  }
  if (!counts) return null;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="queue-counts">
      <StatTile label="Assigned to me" value={counts.total} testId="stat-assigned" />
      <StatTile label="Not started" value={counts.notStarted} hint="ready to mark" testId="stat-not-started" />
      <StatTile label="In progress" value={counts.inProgress} hint="drafts saved" tone="blue" testId="stat-in-progress" />
      <StatTile label="Submitted" value={counts.marked} hint="to the Head Coach" tone="indigo" testId="stat-submitted" />
    </div>
  );
}

/** My tests: "All tests · N to mark", then one pill per test (N = not started + in progress). */
function TestPills({ tests, value, onChange }: { tests: QueuePage["tests"]; value: string; onChange: (v: string) => void }) {
  const left = (t: { notStarted: number; inProgress: number }) => t.notStarted + t.inProgress;
  const all = tests.reduce((a, t) => a + left(t), 0);
  const labelId = useId();
  const pill = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-1 rounded-full border px-4 text-sm transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] focus-visible:ring-offset-1 ${
      active ? "border-[#00428C] bg-[#00428C] font-semibold text-white" : "border-gray-200 bg-white text-gray-700 hover:border-[#00428C] hover:text-[#00428C]"
    }`;
  const count = (n: number) => (n === 0 ? <span>all done <span aria-hidden="true">✓</span></span> : <span><b className="font-bold">{n}</b> to mark</span>);
  return (
    <section className="mb-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm" aria-labelledby={labelId} data-testid="queue-tests">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={labelId}>
        <h2 id={labelId} className="mr-2 font-sans text-[11px] font-bold uppercase tracking-wider text-gray-500">Your tests</h2>
        <button type="button" className={pill(value === "")} aria-pressed={value === ""} onClick={() => onChange("")} data-testid="queue-test-all">
          All tests <span aria-hidden="true">·</span> {count(all)}
        </button>
        {tests.map((t) => (
          <button key={t.id} type="button" className={pill(value === t.id)} aria-pressed={value === t.id} onClick={() => onChange(t.id)} data-testid={`queue-test-${t.id}`}>
            {t.title} <span aria-hidden="true">·</span> {count(left(t))}
          </button>
        ))}
      </div>
    </section>
  );
}

function MyMarks({ r }: { r: QueueItem }) {
  if (r.myTotal == null) return <span className="text-gray-500">—</span>;
  return (
    <>
      <span className="tabular-nums">{marksText(r.myTotal, r.test.maxMarks)}</span>
      {r.state === "IN_PROGRESS" && <span className="ml-1 text-xs text-gray-500">draft</span>}
    </>
  );
}

const actionBase = "inline-flex min-h-10 items-center justify-center gap-1 rounded-full px-4 text-xs font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] focus-visible:ring-offset-1";

/** The row's next step: Revise (returned), Continue (draft), Start marking (not started), View (submitted). */
function queueAction(r: QueueItem): { label: string; className: string } {
  if (r.returned) return { label: "Revise", className: `${actionBase} bg-red-700 text-white hover:bg-red-800` };
  if (r.state === "IN_PROGRESS") return { label: "Continue", className: `${actionBase} border border-gray-200 bg-white text-[#00428C] hover:bg-gray-50` };
  if (r.state === "NOT_STARTED") return { label: "Start marking", className: `${actionBase} bg-[#00428C] text-white hover:bg-[#003672]` };
  return { label: "View", className: `${actionBase} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50` };
}

// ── One paper ──────────────────────────────────────────────────────────────────

export function MarkingWorkspace({ code }: { code: string }) {
  return (
    <MarkingGate title={`Paper ${code}`}>
      <Workspace code={code} />
    </MarkingGate>
  );
}

const WORKSPACE_DESCRIPTION = "Marking is blind: you see the paper code, never the student.";

/** The next paper to mark (returned first, then drafts, then not started; oldest assignment first), and how many are left. */
function useNextPaper(code: string) {
  const ip = { state: "IN_PROGRESS" as const, limit: 100 };
  const ns = { state: "NOT_STARTED" as const, limit: 100 };
  const inProgress = useQuery({ queryKey: queryKeys.tests.queue(ip), queryFn: () => markerApi.queue(ip), retry: false });
  const notStarted = useQuery({ queryKey: queryKeys.tests.queue(ns), queryFn: () => markerApi.queue(ns), retry: false });
  if (!inProgress.data || !notStarted.data) return null;
  const drafts = inProgress.data.data;
  const order = [...drafts.filter((r) => r.returned), ...drafts.filter((r) => !r.returned), ...notStarted.data.data];
  const next = order.find((r) => r.code !== code);
  if (!next) return null;
  const c = notStarted.data.counts;
  return { code: next.code, left: c.notStarted + c.inProgress };
}

function Workspace({ code }: { code: string }) {
  const one = useQuery({ queryKey: queryKeys.tests.toMark(code), queryFn: () => markerApi.get(code), retry: false });
  const next = useNextPaper(code);
  const [panelOpen, setPanelOpen] = useState(true);
  const panelId = useId();
  const topLine = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <Link href="/mentor/marking" className={backLink}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Marking queue</Link>
      {next && (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-gray-600">
          <span>{plural(next.left, "paper")} to mark</span>
          <span aria-hidden="true">·</span>
          <Link href={`/mentor/marking/${next.code}`} className={backLink} data-testid="next-paper">
            Next paper <span className="sr-only">({next.code})</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </p>
      )}
    </div>
  );
  if (one.isPending) return <PageFrame title={`Paper ${code}`} description={WORKSPACE_DESCRIPTION}><LoadingBlock /></PageFrame>;
  if (one.isError) {
    const code_ = isApiError(one.error) ? one.error.code : null;
    return (
      <PageFrame title={`Paper ${code}`} description={WORKSPACE_DESCRIPTION}>
        {topLine}
        {code_ === "MARKING_NOT_ASSIGNED" ? <Notice tone="info">This paper is not assigned to you. Go back to the marking queue to see the papers you can mark.</Notice>
          : code_ === "MARKER_NOT_AUTHORIZED" ? <Notice tone="info">You are no longer authorised to mark this subject. Ask the Head Coach if you think this is a mistake.</Notice>
            : <ErrorState error={one.error} title="Couldn't load the paper" onRetry={() => one.refetch()} />}
      </PageFrame>
    );
  }
  const s = one.data;
  const status = s.myMarking ? MY_MARKING_STATUS[s.myMarking.status] : queueStatus(s.state, false);
  const toggle = (
    <button
      type="button"
      onClick={() => setPanelOpen((o) => !o)}
      aria-expanded={panelOpen}
      aria-controls={panelId}
      className="hidden h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] motion-reduce:transition-none lg:inline-flex"
      data-testid="toggle-marks-panel"
    >
      {panelOpen ? <PanelRightClose className="h-4 w-4" aria-hidden="true" /> : <PanelRightOpen className="h-4 w-4" aria-hidden="true" />}
      {panelOpen ? "Hide marks" : "Show marks"}
    </button>
  );
  return (
    <PageFrame title={`Paper ${s.code}`} description={WORKSPACE_DESCRIPTION}>
      {topLine}
      <div className={`grid grid-cols-1 gap-5 ${panelOpen ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)]" : ""}`}>
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <PaperViewer
            pages={s.answer.pages}
            fetchPage={(n) => markerApi.page(s.code, n)}
            queryKey={queryKeys.tests.toMark(s.code)}
            typedAnswer={s.answer.typedAnswer}
            toolbarEnd={toggle}
          />
        </div>
        <div id={panelId} className={`min-w-0 space-y-4 ${panelOpen ? "" : "lg:hidden"}`} data-testid="marks-panel">
          {s.myMarking?.status === "RETURNED" && s.myMarking.returnComment && (
            <Alert tone="error"><span className="font-semibold">Returned for correction:</span> “{s.myMarking.returnComment}” Correct the marks and submit again.</Alert>
          )}
          <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm" aria-label={`Paper ${s.code}`} data-testid="paper-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Paper</p>
                <p className="break-all font-mono text-xl font-bold" style={{ color: BRAND }} data-testid="paper-code">{s.code}</p>
              </div>
              <MarkingStatusBadge status={status} testId="marking-status" />
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-gray-500">Test</dt>
                <dd className="text-sm font-semibold text-gray-900">{s.test.title}</dd>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <dt className="text-xs text-gray-500">Subject</dt>
                <dd className="text-sm font-semibold text-gray-900">{s.test.subject.name} · {plural(s.test.maxMarks, "mark")}</dd>
              </div>
            </dl>
            {(s.test.paper || s.test.markingGuide) && (
              <div className="mt-3 grid grid-cols-1 gap-3">
                {s.test.paper && (
                  <div><p className="mb-1 text-xs font-semibold text-gray-700">Test paper</p>
                    <FileButton file={{ id: `${s.code}-paper`, originalName: s.test.paper.name, mimeType: s.test.paper.mimeType, size: s.test.paper.size }} fetchFile={() => markerApi.paper(s.code)} /></div>
                )}
                {s.test.markingGuide && (
                  <div data-testid="marking-guide"><p className="mb-1 text-xs font-semibold text-gray-700">Marking guide</p>
                    <FileButton file={{ id: `${s.code}-guide`, originalName: s.test.markingGuide.name, mimeType: s.test.markingGuide.mimeType, size: s.test.markingGuide.size }} fetchFile={() => markerApi.markingGuide(s.code)} /></div>
                )}
              </div>
            )}
          </section>
          <MarksForm s={s} />
        </div>
      </div>
    </PageFrame>
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
  const marked = questions.filter((q) => {
    const v = parseWhole(d.scores[q.id]?.marks ?? "");
    return v !== null && !Number.isNaN(v) && v <= q.maxMarks;
  }).length;

  const apply = (x: MarkerSubmission, message: string) => {
    qc.setQueryData(queryKeys.tests.toMark(s.code), x);
    // My queue and my dashboard numbers change with every save and submit.
    void qc.invalidateQueries({ queryKey: queryKeys.tests.all, predicate: (q) => q.queryKey.includes("queue") || q.queryKey.includes("dashboard") });
    setNotice(message);
  };
  const save = useMutation({
    mutationFn: () => markerApi.save(s.code, { ...marksBody(questions, d), expectedRevision: s.myMarking?.revision }),
    onSuccess: (x) => apply(x, `Draft saved ${formatDateTime(x.myMarking?.savedAt ?? new Date().toISOString())}.`),
    onError: (e) => setError(isApiError(e) && e.code === "MARKING_CHANGED"
      ? "Your marking was changed somewhere else (another tab or device) since you opened this page. Reload the page to see the latest marks, then save again."
      : errorMessage(e)),
  });

  /** Moves the focus to the first field with a problem (after React has drawn it). */
  const focusFirst = (p: Record<string, string>) => {
    const first = questions.length === 0 ? (p.total ? `${ids}-total` : null) : (() => {
      const q = questions.find((x) => p[`q:${x.id}`]);
      return q ? `${ids}-${q.id}-m` : null;
    })();
    if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
  };
  /** The message for problems found before submitting (naming the questions not marked yet). */
  const submitProblem = (p: Record<string, string>): string => {
    if (questions.length === 0) return p.total === MISSING_MARKS ? "Give the total marks before submitting." : "Correct the total marks before submitting.";
    const missing = questions.filter((q) => p[`q:${q.id}`] === MISSING_MARKS).map((q) => q.order);
    return missing.length
      ? `Give marks for every question before submitting. Not marked yet: ${questionList(missing)}.`
      : "Correct the marks shown in red before submitting.";
  };

  function onSave(e: FormEvent) {
    e.preventDefault();
    const p = marksProblems(questions, s.test.maxMarks, d, false);
    setErrors(p);
    setNotice(null);
    if (Object.keys(p).length) { focusFirst(p); return; }
    setError(null);
    save.mutate();
  }
  function onSubmit() {
    const p = marksProblems(questions, s.test.maxMarks, d, true);
    setErrors(p);
    setNotice(null);
    if (Object.keys(p).length) { setError(submitProblem(p)); focusFirst(p); return; }
    setError(null);
    setConfirm(true);
  }
  async function confirmSubmit() {
    try {
      apply(await markerApi.submit(s.code, marksBody(questions, d)), "Submitted for approval.");
    } catch (e) {
      // The server's own check (e.g. a question added since this page opened): name the questions and mark them red.
      if (isApiError(e) && e.code === "MARKS_INCOMPLETE") {
        const missing = (e.details as { missing?: unknown[] } | undefined)?.missing ?? [];
        const p: Record<string, string> = {};
        for (const m of missing) {
          if (m === "total") p.total = MISSING_MARKS;
          const q = questions.find((x) => x.order === m);
          if (q) p[`q:${q.id}`] = MISSING_MARKS;
        }
        setErrors(p);
        const message = Object.keys(p).length ? submitProblem(p) : "Give marks for every question before submitting.";
        setError(message);
        throw new UserFacingError(message);
      }
      throw e;
    }
  }

  const scope = questions.length
    ? `The whole paper — ${plural(questions.length, "question")}, ${plural(s.test.maxMarks, "mark")}`
    : `The whole paper — one total, ${plural(s.test.maxMarks, "mark")}`;
  const pct = questions.length ? Math.round((marked / questions.length) * 100) : total != null ? 100 : 0;
  const readOnlyWhy = s.myMarking?.status === "APPROVED"
    ? "Approved by the Head Coach: these marks are locked."
    : s.myMarking?.status === "SUBMITTED" || s.state === "MARKED"
      ? "Submitted for approval: your marks can no longer change unless the Head Coach returns them to you."
      : "You can't change these marks now.";

  return (
    <>
      <section className="rounded-xl p-5 text-white shadow-sm" style={{ backgroundColor: BRAND }} aria-labelledby={`${ids}-scope`} data-testid="marking-scope">
        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">You are marking</p>
        <h2 id={`${ids}-scope`} className="mt-1 text-lg font-bold text-white">{scope}</h2>
        <p className="mt-1 text-sm text-blue-100" data-testid="marking-progress">
          {questions.length ? `${marked} of ${plural(questions.length, "question")} marked · ` : ""}{marksText(total, s.test.maxMarks)} so far
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20" role="img" aria-label={questions.length ? `${marked} of ${questions.length} questions marked` : total != null ? "Total given" : "No total yet"}>
          <div className="h-full rounded-full bg-white transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section aria-labelledby={`${ids}-h`} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <form onSubmit={onSave} noValidate className="space-y-4" data-testid="marks-form">
          <h2 id={`${ids}-h`} className="text-lg font-bold text-gray-900">Marks</h2>
          {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
          {error && <Alert tone="error">{error}</Alert>}
          {!s.canEdit && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-gray-700" data-testid="marks-read-only">{readOnlyWhy}</p>}
          {questions.length === 0 ? (
            <div className="max-w-[12rem]">
              <label htmlFor={`${ids}-total`} className={labelCls}>Total marks (of {s.test.maxMarks})</label>
              <input id={`${ids}-total`} inputMode="numeric" className={`${inputCls} ${errors.total ? inputBad : inputOk}`} value={d.total} disabled={disabled}
                onChange={(e) => setD((x) => ({ ...x, total: e.target.value }))} aria-invalid={!!errors.total} aria-describedby={errors.total ? `${ids}-total-e` : undefined}
                data-testid="total-marks" />
              {errors.total && <p id={`${ids}-total-e`} className="mt-1 text-xs font-semibold text-red-700">{errors.total === MISSING_MARKS ? "Not marked yet" : errors.total}</p>}
            </div>
          ) : (
            <ol className="space-y-3" data-testid="question-marks">
              {questions.map((q) => {
                const v = d.scores[q.id] ?? { marks: "", comment: "" };
                const set = (patch: Partial<typeof v>) => setD((x) => ({ ...x, scores: { ...x.scores, [q.id]: { ...(x.scores[q.id] ?? { marks: "", comment: "" }), ...patch } } }));
                return (
                  <CoachQuestionCard
                    key={q.id}
                    q={q}
                    marks={v.marks}
                    comment={v.comment}
                    onMarks={(marks) => set({ marks })}
                    onComment={(comment) => set({ comment })}
                    error={errors[`q:${q.id}`]}
                    commentError={errors[`q:${q.id}:comment`]}
                    disabled={disabled}
                    idBase={`${ids}-${q.id}`}
                  />
                );
              })}
            </ol>
          )}
          <div>
            <label htmlFor={`${ids}-comment`} className={labelCls}>Overall comment <span className="font-normal text-gray-500">(optional, for the Head Coach)</span></label>
            <textarea id={`${ids}-comment`} rows={3} maxLength={2000} className={`${inputCls} ${errors.comment ? inputBad : inputOk}`} value={d.comment} disabled={disabled}
              onChange={(e) => setD((x) => ({ ...x, comment: e.target.value }))} aria-invalid={!!errors.comment} aria-describedby={errors.comment ? `${ids}-comment-e` : undefined} />
            {errors.comment && <p id={`${ids}-comment-e`} className="mt-1 text-xs text-red-700">{errors.comment}</p>}
          </div>
          <p className="text-sm font-semibold text-gray-900" data-testid="running-total" aria-live="polite">Total: {marksText(total, s.test.maxMarks)}</p>
          {s.canEdit && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button type="submit" className={`${btnSecondary} min-h-10 w-full`} disabled={save.isPending} data-testid="save-draft">{save.isPending ? "Saving…" : "Save draft"}</button>
                <button type="button" className={`${btnPrimary} min-h-10 w-full`} onClick={onSubmit} data-testid="submit-marking">Submit for approval</button>
              </div>
              <p className="text-xs text-gray-500">
                {s.myMarking?.savedAt ? `Last saved ${formatDateTime(s.myMarking.savedAt)}. ` : ""}Submitting needs every question marked.
              </p>
            </>
          )}
        </form>
        {confirm && (
          <ConfirmDialog
            title="Submit your marking?"
            body={<>Total {marksText(total, s.test.maxMarks)}. After submitting, your marks can change only if the Head Coach returns them.</>}
            confirmLabel="Submit"
            onConfirm={confirmSubmit}
            onClose={() => setConfirm(false)}
          />
        )}
      </section>
    </>
  );
}
