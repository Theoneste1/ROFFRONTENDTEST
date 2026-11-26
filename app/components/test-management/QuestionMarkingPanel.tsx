"use client";

/**
 * The test page's "Question marking" tab (capability questionMarking; design Rev 5.2) for the subject's Head Coach,
 * Administrators and Super Administrators:
 *   - Mode: By paper (default) or By question — only before any marking exists (tests.manage);
 *   - Progress: papers and questions by state, coaches' work, held questions that ran out, work needing reassignment;
 *   - Coaches per question (tests.distribute): add / remove (removal: a reason; their open work ends) and "Prepare the
 *     questions" (creates each eligible paper's question tasks; idempotent; lists skipped papers and why);
 *   - Questions of papers (tests.review): filters; one question of one paper opens the review — the whole paper, every
 *     assessment with its versions, decisions, holds and events; approve, return (reason), second assessment, cancel it,
 *     decide (the subject's Head Coach only — G4), reopen (reason), assign or release (reason), "I'm reviewing".
 *   - Super Administrators: correct a question's wording or the questions' structure after marking started (reason).
 * Staff see names (not blind). Every action carries the status and cycle seen; someone faster → "changed a moment ago".
 */
import { useId, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  staffQmApi, type DecisionSource, type MarkingMode, type Person, type QmMarkers, type StaffTaskDetail, type StaffTaskRow, type TaskStatus,
} from "@/lib/api/question-marking";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import {
  ASSESSMENT_STATUS_LABEL, MODE_LABEL, PAPER_PROGRESS_LABEL, REASON_MAX, REASON_MIN, TASK_STATUS_BADGE, TESTS_DISTRIBUTE, TESTS_MANAGE,
  TESTS_REVIEW, parseQuestionMarks, reasonProblem, staffRefusal,
} from "@/lib/test-management/question-marking";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { ConfirmDialog, MetricCard, Modal, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { PaperViewer } from "@/app/components/marking/PaperViewer";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

const REASON = { label: "Reason", required: true, min: REASON_MIN, max: REASON_MAX } as const;
const name = (p: Person | null | undefined) => (p ? personName(p) : "—");

function refusal(e: unknown): string {
  return isApiError(e) ? staffRefusal(e.code) ?? errorMessage(e) : errorMessage(e);
}

function TaskBadge({ status }: { status: TaskStatus }) {
  const b = TASK_STATUS_BADGE[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`} data-testid="qm-task-status">{b.label}</span>;
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

export default function QuestionMarkingPanel({ testId, testStatus }: { testId: string; testStatus: string }) {
  const { can, permissionsStatus, role } = useSession();
  const canManage = actionAllowed(TESTS_MANAGE, permissionsStatus, can);
  const canDistribute = actionAllowed(TESTS_DISTRIBUTE, permissionsStatus, can);
  const canReview = actionAllowed(TESTS_REVIEW, permissionsStatus, can);
  const qc = useQueryClient();
  const overview = useQuery({ queryKey: queryKeys.tests.qm(testId), queryFn: () => staffQmApi.overview(testId) });
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [confirmMode, setConfirmMode] = useState<MarkingMode | null>(null);
  if (overview.isPending) return <LoadingBlock />;
  if (overview.isError) return <ErrorState error={overview.error} title="Couldn't load question marking" onRetry={() => overview.refetch()} />;
  const o = overview.data;
  const byQuestion = o.test.markingMode === "QUESTION";
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.tests.qm(testId) });
  return (
    <div className="space-y-10" data-testid="qm-panel">
      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      <Section title="How this test is marked" testId="qm-mode">
        <p className="text-sm text-gray-800">
          <span className="font-semibold" data-testid="qm-mode-value">{MODE_LABEL[o.test.markingMode]}</span>
          {byQuestion
            ? " — each question of each paper is marked on its own, by the coaches you choose for that question."
            : " — each paper is marked whole by one coach (Markers & distribution, Review)."}
        </p>
        {canManage && (o.modeLocked ? (
          <p className="text-sm text-gray-600">Marking has started, so the mode can no longer change.</p>
        ) : (
          <button type="button" className={btnSecondary} onClick={() => setConfirmMode(byQuestion ? "PAPER" : "QUESTION")} data-testid="qm-switch-mode">
            {byQuestion ? "Mark by paper instead" : "Mark by question instead"}
          </button>
        ))}
      </Section>
      {byQuestion && (
        <>
          <ProgressSection testId={testId} />
          {canDistribute && <MarkersSection testId={testId} testStatus={testStatus} onNotice={setNotice} />}
          {canReview && <TasksSection testId={testId} role={role} canDistribute={canDistribute} onNotice={setNotice} />}
          {role === "SUPER_ADMIN" && <CorrectionsSection testId={testId} onNotice={setNotice} />}
        </>
      )}
      {confirmMode && (
        <ConfirmDialog
          title={confirmMode === "QUESTION" ? "Mark this test by question?" : "Mark this test by paper?"}
          body={confirmMode === "QUESTION"
            ? "You will choose coaches for each question. Each coach takes one question of one paper at a time and sees the whole paper. Possible only before any marking starts."
            : "Each paper will be marked whole by one coach, as before."}
          confirmLabel={confirmMode === "QUESTION" ? "Mark by question" : "Mark by paper"}
          onClose={() => setConfirmMode(null)}
          onConfirm={async () => {
            try {
              await staffQmApi.setMode(testId, confirmMode);
              setNotice({ tone: "success", text: `This test is now marked ${MODE_LABEL[confirmMode].toLowerCase()}.` });
            } catch (e) {
              setNotice({ tone: "error", text: refusal(e) });
            }
            setConfirmMode(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Progress ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function ProgressSection({ testId }: { testId: string }) {
  const p = useQuery({ queryKey: queryKeys.tests.qmProgress(testId), queryFn: () => staffQmApi.progress(testId) });
  return (
    <Section title="Progress" testId="qm-progress">
      {p.isPending ? <LoadingBlock /> : p.isError ? <ErrorState error={p.error} title="Couldn't load the progress" onRetry={() => p.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Papers" value={p.data.papers.total} subtext={`${p.data.papers.fullyApproved} fully approved`} />
            <MetricCard label="Questions to mark" value={p.data.tasks.total} subtext={`${p.data.tasks.byStatus.APPROVED ?? 0} approved`} />
            <MetricCard label="Holds that ran out" value={p.data.expiredClaims} subtext="returned to the list automatically" />
            <MetricCard label="Need a new coach" value={p.data.needsReassignment} subtext="returned work whose coach can no longer mark" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs" data-testid="qm-paper-states">
            {Object.entries(PAPER_PROGRESS_LABEL).filter(([k]) => (p.data.papers[k] ?? 0) > 0).map(([k, label]) => (
              <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-800">{label}: {p.data.papers[k]}</span>
            ))}
          </div>
          <TableCard>
            <thead className="bg-gray-50/80"><tr><th className={th}>Question</th><th className={th}>Coaches</th><th className={th}>Not started</th><th className={th}>Being marked</th><th className={th}>Awaiting review</th><th className={th}>Approved</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {p.data.questions.length === 0 && <TableMessage colSpan={6}>No questions yet.</TableMessage>}
              {p.data.questions.map((q) => (
                <tr key={q.order} data-testid={`qm-progress-q${q.order}`}>
                  <td className={td}>Question {q.order} <span className="text-xs text-gray-600">/ {q.maxMarks}</span></td>
                  <td className={td}>{q.unassigned ? <span className="font-semibold text-rose-800">None yet</span> : q.coaches}</td>
                  <td className={td}>{q.byStatus.NOT_STARTED ?? 0}</td>
                  <td className={td}>{(q.byStatus.IN_PROGRESS ?? 0) + (q.byStatus.EXPIRED ?? 0)}</td>
                  <td className={td}>{(q.byStatus.SUBMITTED ?? 0) + (q.byStatus.UNDER_REVIEW ?? 0) + (q.byStatus.AWAITING_SECOND ?? 0)}</td>
                  <td className={td}>{q.byStatus.APPROVED ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          {p.data.coaches.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="qm-coach-progress">
              {p.data.coaches.map((c) => (
                <li key={c.id} className="rounded-lg border border-gray-100 bg-white p-3 text-sm">
                  <span className="font-semibold text-gray-900">{personName(c)}</span>
                  <span className="block text-xs text-gray-600">holding {c.holding} · submitted {c.submitted} · approved {c.approved}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

// ── Coaches per question ─────────────────────────────────────────────────────────────────────────────────────────────

function MarkersSection({ testId, testStatus, onNotice }: { testId: string; testStatus: string; onNotice: (n: { tone: "success" | "error" | "info"; text: string }) => void }) {
  const qc = useQueryClient();
  const m = useQuery({ queryKey: queryKeys.tests.qmMarkers(testId), queryFn: () => staffQmApi.markers(testId) });
  const [removing, setRemoving] = useState<{ questionId: string; order: number; coach: Person } | null>(null);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: queryKeys.tests.qm(testId) })]);
  const add = useMutation({
    mutationFn: (v: { questionId: string; coachId: string }) => staffQmApi.setMarkers(testId, v.questionId, { add: [v.coachId] }),
    onSuccess: (d) => { qc.setQueryData(queryKeys.tests.qmMarkers(testId), d); void refresh(); },
    onError: (e) => onNotice({ tone: "error", text: refusal(e) }),
  });
  const generate = useMutation({
    mutationFn: () => staffQmApi.generate(testId),
    onSuccess: (r) => {
      const skipped = r.skipped.length ? ` ${r.skipped.length} paper(s) skipped: ${r.skipped.slice(0, 5).map((s) => `${s.code} (${s.reason === "DEADLINE_NOT_PASSED" ? "deadline not passed" : s.reason === "NO_ANSWER" ? "no answer" : "new version allowed"})`).join(", ")}${r.skipped.length > 5 ? "…" : ""}.` : "";
      onNotice({ tone: "success", text: `${r.created} question(s) of ${r.papers} paper(s) are ready for the coaches.${skipped}` });
      void refresh();
    },
    onError: (e) => onNotice({ tone: "error", text: refusal(e) }),
  });
  return (
    <Section title="Coaches for each question" testId="qm-markers">
      {m.isPending ? <LoadingBlock /> : m.isError ? <ErrorState error={m.error} title="Couldn't load the coaches" onRetry={() => m.refetch()} /> : (
        <>
          {m.data.candidates.length === 0 && <Notice tone="info">No coach is authorised for this subject yet. Authorise coaches in Markers first.</Notice>}
          <ul className="space-y-3">
            {m.data.questions.map((q) => <QuestionMarkersRow key={q.id} q={q} candidates={m.data.candidates} busy={add.isPending}
              onAdd={(coachId) => add.mutate({ questionId: q.id, coachId })} onRemove={(coach) => setRemoving({ questionId: q.id, order: q.order, coach })} />)}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} disabled={generate.isPending || testStatus !== "PUBLISHED"} onClick={() => generate.mutate()} data-testid="qm-generate">
              {generate.isPending ? "Preparing…" : "Prepare the questions of submitted papers"}
            </button>
            <span className="text-xs text-gray-600">Safe to repeat: papers already prepared are not changed. Papers whose deadline has not passed wait.</span>
          </div>
        </>
      )}
      {removing && (
        <ConfirmDialog title={`Remove ${personName(removing.coach)} from question ${removing.order}?`}
          body="Their open work on this question ends now; questions returned to them will need another coach. Their submitted marks stay."
          confirmLabel="Remove" tone="danger" note={REASON} onClose={() => setRemoving(null)}
          onConfirm={async (reason) => {
            try {
              const d = await staffQmApi.setMarkers(testId, removing.questionId, { remove: [removing.coach.id], reason });
              qc.setQueryData(queryKeys.tests.qmMarkers(testId), d);
              onNotice({ tone: "success", text: `${personName(removing.coach)} no longer marks question ${removing.order}.` });
              await refresh();
            } catch (e) {
              onNotice({ tone: "error", text: refusal(e) });
            }
            setRemoving(null);
          }} />
      )}
    </Section>
  );
}

function QuestionMarkersRow({ q, candidates, busy, onAdd, onRemove }: {
  q: QmMarkers["questions"][number]; candidates: Person[]; busy: boolean; onAdd: (coachId: string) => void; onRemove: (c: Person) => void;
}) {
  const id = useId();
  const [pick, setPick] = useState("");
  const free = candidates.filter((c) => !q.coaches.some((x) => x.id === c.id));
  return (
    <li className="rounded-xl border border-gray-100 bg-white p-4" data-testid={`qm-markers-q${q.order}`}>
      <p className="text-sm font-semibold text-gray-900">Question {q.order} <span className="text-xs font-normal text-gray-600">· out of {q.maxMarks}</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        {q.coaches.length === 0 && <span className="text-sm font-medium text-rose-800">No coach yet</span>}
        {q.coaches.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-900">
            {personName(c)}
            <button type="button" className="rounded-full px-2 text-slate-700 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C]"
              aria-label={`Remove ${personName(c)} from question ${q.order}`} onClick={() => onRemove(c)}>×</button>
          </span>
        ))}
      </div>
      {free.length > 0 && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label htmlFor={`${id}-add`} className="sr-only">Add a coach to question {q.order}</label>
          <select id={`${id}-add`} className={`${inputCls} ${inputOk} min-h-10 max-w-xs`} value={pick} onChange={(e) => setPick(e.target.value)} data-testid={`qm-add-select-q${q.order}`}>
            <option value="">Add a coach…</option>
            {free.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
          </select>
          <button type="button" className={btnSecondary} disabled={!pick || busy} onClick={() => { onAdd(pick); setPick(""); }} data-testid={`qm-add-q${q.order}`}>Add</button>
        </div>
      )}
    </li>
  );
}

// ── Questions of papers: list and review ─────────────────────────────────────────────────────────────────────────────

const STATUS_FILTERS: ReadonlyArray<{ value: "" | TaskStatus; label: string }> = [
  { value: "", label: "All" }, { value: "SUBMITTED", label: "Awaiting review" }, { value: "IN_PROGRESS", label: "Being marked" },
  { value: "NOT_STARTED", label: "Not started" }, { value: "RETURNED", label: "Returned" }, { value: "AWAITING_SECOND", label: "Second assessment" },
  { value: "APPROVED", label: "Approved" },
];

function TasksSection({ testId, role, canDistribute, onNotice }: { testId: string; role: string | null; canDistribute: boolean; onNotice: (n: { tone: "success" | "error" | "info"; text: string }) => void }) {
  const [status, setStatus] = useState<"" | TaskStatus>("SUBMITTED");
  const [question, setQuestion] = useState("");
  const [code, setCode] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<StaffTaskRow | null>(null);
  const f = { status: status || undefined, question: question ? Number(question) : undefined, code: code.trim() || undefined, round: "FIRST" as const, page, limit: 25 };
  const list = useQuery({ queryKey: queryKeys.tests.qmTasks(testId, f), queryFn: () => staffQmApi.tasks(testId, f), placeholderData: keepPreviousData });
  return (
    <Section title="Questions of the papers" testId="qm-tasks">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className={labelCls}>Status</span>
          <select className={`${inputCls} ${inputOk} min-h-10`} value={status} onChange={(e) => { setStatus(e.target.value as "" | TaskStatus); setPage(1); }} data-testid="qm-status-filter">
            {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className={labelCls}>Question</span>
          <input className={`${inputCls} ${inputOk} min-h-10 w-24`} inputMode="numeric" value={question} placeholder="Any" onChange={(e) => { setQuestion(e.target.value.replace(/\D/g, "").slice(0, 3)); setPage(1); }} />
        </label>
        <label className="text-sm"><span className={labelCls}>Paper code</span>
          <input className={`${inputCls} ${inputOk} min-h-10 w-36 font-mono uppercase`} value={code} placeholder="ABCD-1234" onChange={(e) => { setCode(e.target.value); setPage(1); }} />
        </label>
      </div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the questions" onRetry={() => list.refetch()} /> : list.data.data.length === 0 ? (
        <EmptyState title="Nothing here" description="No question of a paper matches these filters." />
      ) : (
        <TableCard footer={<Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} />}>
          <thead className="bg-gray-50/80"><tr><th className={th}>Paper</th><th className={th}>Student</th><th className={th}>Question</th><th className={th}>Status</th><th className={th}>Coach</th><th className={th}>Marks</th><th className={th}><span className="sr-only">Open</span></th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {list.data.data.map((r) => (
              <tr key={r.id} data-testid={`qm-task-${r.submission.publicCode}-q${r.question.order}`}>
                <td className={`${td} font-mono font-bold text-[#00428C]`}>{r.submission.publicCode}</td>
                <td className={td}>{name(r.submission.student)}</td>
                <td className={td}>Q{r.question.order} <span className="text-xs text-gray-600">/ {r.question.maxMarks}</span></td>
                <td className={td}><TaskBadge status={r.status} />{r.needsReassignment && <span className="block text-xs font-semibold text-rose-800">Needs a new coach</span>}</td>
                <td className={td}>{r.holder ? name(r.holder) : r.reservedFor ? `${name(r.reservedFor)} (returned)` : r.submitted ? name(r.submitted.marker) : "—"}</td>
                <td className={`${td} tabular-nums`}>{r.finalMarks ?? r.submitted?.marks ?? "—"}</td>
                <td className={`${td} text-right`}><button type="button" className={btnSecondary} onClick={() => setOpen(r)} data-testid={`qm-open-task-${r.submission.publicCode}-q${r.question.order}`}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      {open && <TaskReview testId={testId} row={open} role={role} canDistribute={canDistribute} onClose={() => setOpen(null)} onNotice={onNotice} />}
    </Section>
  );
}

type ActionKind = "approve" | "return" | "second" | "cancelSecond" | "decide" | "reopen" | "assign" | "release" | "hold";

function TaskReview({ testId, row, role, canDistribute, onClose, onNotice }: {
  testId: string; row: StaffTaskRow; role: string | null; canDistribute: boolean; onClose: () => void;
  onNotice: (n: { tone: "success" | "error" | "info"; text: string }) => void;
}) {
  const qc = useQueryClient();
  const key = queryKeys.tests.qmStaffTask(testId, row.id);
  const d = useQuery({ queryKey: key, queryFn: () => staffQmApi.task(testId, row.id) });
  const [action, setAction] = useState<ActionKind | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const done = async (text: string) => {
    onNotice({ tone: "success", text });
    setAction(null);
    await Promise.all([qc.invalidateQueries({ queryKey: queryKeys.tests.qm(testId) }), d.refetch()]);
  };
  const fail = async (e: unknown) => { setProblem(refusal(e)); setAction(null); await d.refetch(); };
  return (
    <Modal title={`Paper ${row.submission.publicCode} · Question ${row.question.order}`} onClose={onClose} wide>
      {d.isPending ? <LoadingBlock /> : d.isError ? <ErrorState error={d.error} title="Couldn't load this question" onRetry={() => d.refetch()} /> : (
        <TaskReviewBody detail={d.data} testId={testId} role={role} canDistribute={canDistribute} problem={problem} onProblemClose={() => setProblem(null)}
          action={action} onAction={setAction} onDone={done} onFail={fail} />
      )}
    </Modal>
  );
}

function TaskReviewBody({ detail, testId, role, canDistribute, problem, onProblemClose, action, onAction, onDone, onFail }: {
  detail: StaffTaskDetail; testId: string; role: string | null; canDistribute: boolean; problem: string | null; onProblemClose: () => void;
  action: ActionKind | null; onAction: (a: ActionKind | null) => void; onDone: (text: string) => Promise<void>; onFail: (e: unknown) => Promise<void>;
}) {
  const t = detail.task;
  const a = detail.allowed;
  const guard = { expectedStatus: t.status, cycleSeen: t.currentCycle };
  const pages = (t.submission.currentVersion?.pages ?? []).map((p) => ({ page: p.pageNumber, name: `page-${p.pageNumber}`, mimeType: p.file.mimeType, size: 0 }));
  const current = detail.decisions.find((x) => !x.supersededAt) ?? null;
  const run = async (fn: () => Promise<unknown>, text: string) => { try { await fn(); await onDone(text); } catch (e) { await onFail(e); } };
  const reasonDialog = (kind: ActionKind, title: string, label: string, fn: (reason: string) => Promise<unknown>, text: string, body?: string, danger?: boolean) => action === kind && (
    <ConfirmDialog title={title} body={body} confirmLabel={label} tone={danger ? "danger" : "primary"} note={REASON} onClose={() => onAction(null)} onConfirm={(reason) => run(() => fn(reason), text)} />
  );
  return (
    <div className="space-y-5" data-testid="qm-review">
      {problem && <Notice tone="error" onClose={onProblemClose}>{problem}</Notice>}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <TaskBadge status={t.status} />
        <span>Student: <span className="font-semibold">{name(t.submission.student)}</span></span>
        {t.holder && <span>Being marked by {name(t.holder)}{t.lockExpiresAt ? ` until ${formatDateTime(t.lockExpiresAt)}` : ""}</span>}
        {t.reservedFor && <span>Returned to {name(t.reservedFor)}</span>}
        {current && <span className="font-semibold">Final: {current.marks} / {t.question.maxMarks}</span>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-slate-50 p-3 text-sm"><span className="font-semibold">Question {t.question.order} (out of {t.question.maxMarks}):</span> <span className="whitespace-pre-wrap">{t.question.prompt}</span></div>
      <PaperViewer pages={pages} typedAnswer={t.submission.currentVersion?.typedAnswer ?? null} queryKey={["qm-staff-page", testId, t.submission.id]}
        fetchPage={(n) => staffQmApi.page(testId, t.submission.id, n)} title="The whole answer paper" testId="qm-staff-viewer" />
      <div>
        <h4 className="text-sm font-bold text-gray-900">Assessments</h4>
        <ul className="mt-2 space-y-2">
          {detail.assessments.length === 0 && <li className="text-sm text-gray-600">No assessment yet.</li>}
          {detail.assessments.map((x) => {
            const round = detail.tasks.find((k) => k.id === x.taskId);
            return (
              <li key={x.id} className="rounded-lg border border-gray-100 bg-white p-3 text-sm" data-testid="qm-assessment">
                <p><span className="font-semibold">{name(x.marker)}</span> · {round?.round === "SECOND" ? `second assessment ${round.cycle}` : "first marking"} · {ASSESSMENT_STATUS_LABEL[x.status]}
                  {x.marks !== null && <> · <span className="font-semibold tabular-nums">{x.marks}</span> / {t.question.maxMarks}</>}</p>
                {x.comment && <p className="mt-1 whitespace-pre-wrap text-gray-800">{x.comment}</p>}
                {x.versions.length > 1 && <p className="mt-1 text-xs text-gray-600">Earlier versions: {x.versions.slice(0, -1).map((v) => `${v.marks} (${formatDateTime(v.submittedAt)})`).join(", ")}</p>}
              </li>
            );
          })}
        </ul>
      </div>
      {detail.decisions.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-gray-900">Decisions</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {detail.decisions.map((x) => (
              <li key={x.id} className={x.supersededAt ? "text-gray-500 line-through" : ""}>{x.marks} / {t.question.maxMarks} · {x.source === "ADJUSTED" ? "adjusted" : x.source === "FIRST" ? "first marking" : "second assessment"} · {name(x.decidedBy)} · {formatDateTime(x.decidedAt)}{x.reason ? ` · ${x.reason}` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4" data-testid="qm-actions">
        {(t.status === "SUBMITTED") && <button type="button" className={btnSecondary} onClick={() => run(() => staffQmApi.reviewHold(testId, t.id), "You are reviewing this question; others see it for 15 minutes.")} data-testid="qm-hold">I&apos;m reviewing</button>}
        {a.approve && <button type="button" className={btnPrimary} onClick={() => run(() => staffQmApi.approve(testId, t.id, guard), "Approved.")} data-testid="qm-approve">Approve</button>}
        {a.return && <button type="button" className={btnSecondary} onClick={() => onAction("return")} data-testid="qm-return">Return to the coach</button>}
        {a.requestSecond && <button type="button" className={btnSecondary} onClick={() => onAction("second")} data-testid="qm-second">Second assessment</button>}
        {a.cancelSecond && <button type="button" className={btnSecondary} onClick={() => onAction("cancelSecond")} data-testid="qm-cancel-second">Cancel the second assessment</button>}
        {a.decide && <button type="button" className={btnPrimary} onClick={() => onAction("decide")} data-testid="qm-decide">Decide the marks</button>}
        {a.reopen && <button type="button" className={btnSecondary} onClick={() => onAction("reopen")} data-testid="qm-reopen">Reopen</button>}
        {a.assign && canDistribute && <button type="button" className={btnSecondary} onClick={() => onAction("assign")} data-testid="qm-assign">Assign to a coach</button>}
        {a.release && canDistribute && <button type="button" className={btnSecondary} onClick={() => onAction("release")} data-testid="qm-release-staff">Release from the coach</button>}
        {t.status === "AWAITING_SECOND" && !a.decide && detail.currentSecond?.status === "SUBMITTED" && role !== "HEAD_COACH" && (
          <p className="text-sm text-gray-700">Both assessments are in. The subject&apos;s Head Coach decides the marks.</p>
        )}
      </div>
      {reasonDialog("return", "Return this question to the coach?", "Return", (reason) => staffQmApi.returnTask(testId, t.id, { ...guard, reason }), "Returned to the coach with your reason.")}
      {reasonDialog("cancelSecond", "Cancel the second assessment?", "Cancel it", (reason) => staffQmApi.cancelSecond(testId, t.id, { reason }), "The second assessment was cancelled.", undefined, true)}
      {reasonDialog("release", "Release this question from the coach?", "Release", (reason) => staffQmApi.release(testId, t.id, { reason }), "Released: it is back in the list.", "Their draft is kept in the history; the next coach starts with empty marks.")}
      {action === "second" && <SecondDialog detail={detail} testId={testId} onClose={() => onAction(null)} run={run} />}
      {action === "assign" && <AssignDialog detail={detail} testId={testId} onClose={() => onAction(null)} run={run} />}
      {action === "decide" && <DecideDialog detail={detail} testId={testId} onClose={() => onAction(null)} run={run} />}
      {action === "reopen" && <ReopenDialog detail={detail} testId={testId} onClose={() => onAction(null)} run={run} />}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-gray-900">History ({detail.events.length} events, {detail.claims.length} holds)</summary>
        <ul className="mt-2 space-y-1 text-xs text-gray-700">
          {detail.claims.map((c) => <li key={c.id}>Held by {name(c.coach)} from {formatDateTime(c.claimedAt)}{c.endedAt ? ` to ${formatDateTime(c.endedAt)} (${c.endReason?.toLowerCase().replace(/_/g, " ")})` : " (now)"}</li>)}
          {detail.events.map((e) => <li key={e.id}>{formatDateTime(e.createdAt)} · {e.action.toLowerCase().replace(/_/g, " ")}{e.actor ? ` · ${name(e.actor)}` : ""}{e.reason ? ` · ${e.reason}` : ""}</li>)}
        </ul>
      </details>
    </div>
  );
}

type Run = (fn: () => Promise<unknown>, text: string) => Promise<void>;

function useCandidates(testId: string) {
  return useQuery({ queryKey: queryKeys.tests.qmMarkers(testId), queryFn: () => staffQmApi.markers(testId) });
}

function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <Modal title={title} onClose={onClose}>{children}</Modal>;
}

function ReasonField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string | null }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={labelCls}>Reason</label>
      <textarea id={id} rows={3} maxLength={REASON_MAX} className={`${inputCls} ${error ? inputBad : inputOk}`} value={value} onChange={(e) => onChange(e.target.value)} />
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function SecondDialog({ detail, testId, onClose, run }: { detail: StaffTaskDetail; testId: string; onClose: () => void; run: Run }) {
  const c = useCandidates(testId);
  const [coachId, setCoachId] = useState("");
  const [reason, setReason] = useState("");
  const first = detail.assessments.find((x) => detail.tasks.find((k) => k.id === x.taskId)?.round === "FIRST")?.marker.id;
  const options = (c.data?.candidates ?? []).filter((p) => p.id !== first);
  return (
    <DialogFrame title="Ask for a second assessment" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => staffQmApi.requestSecond(testId, detail.task.id, { coachId: coachId || undefined, reason: reason.trim() || undefined, cycleSeen: detail.task.currentCycle }), "A second assessment was requested."); }}>
        <p className="text-sm text-gray-700">Another coach marks this question again without seeing the first marks. Leave the coach empty to let any coach of this question take it.</p>
        <label className="block text-sm"><span className={labelCls}>Coach (optional)</span>
          <select className={`${inputCls} ${inputOk} min-h-10`} value={coachId} onChange={(e) => setCoachId(e.target.value)} data-testid="qm-second-coach">
            <option value="">Any coach of this question</option>
            {options.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
          </select>
        </label>
        <ReasonField value={reason} onChange={setReason} error={null} />
        <div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose}>Cancel</button><button type="submit" className={btnPrimary} data-testid="qm-second-confirm">Ask</button></div>
      </form>
    </DialogFrame>
  );
}

function AssignDialog({ detail, testId, onClose, run }: { detail: StaffTaskDetail; testId: string; onClose: () => void; run: Run }) {
  const c = useCandidates(testId);
  const [coachId, setCoachId] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = c.data?.questions.find((x) => x.order === detail.task.question.order);
  const options = q?.coaches ?? [];
  return (
    <DialogFrame title="Assign this question to a coach" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const p = reasonProblem(reason); if (!coachId || p) { setErr(p ?? "Choose a coach."); return; } void run(() => staffQmApi.assign(testId, detail.task.id, { coachId, reason: reason.trim() }), "Assigned. The coach was told."); }}>
        <p className="text-sm text-gray-700">Only coaches of this question can be assigned, and only while they hold fewer than 3 questions.</p>
        <label className="block text-sm"><span className={labelCls}>Coach</span>
          <select className={`${inputCls} ${inputOk} min-h-10`} value={coachId} onChange={(e) => setCoachId(e.target.value)} data-testid="qm-assign-coach">
            <option value="">Choose…</option>
            {options.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
          </select>
        </label>
        <ReasonField value={reason} onChange={setReason} error={err} />
        <div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose}>Cancel</button><button type="submit" className={btnPrimary} data-testid="qm-assign-confirm">Assign</button></div>
      </form>
    </DialogFrame>
  );
}

function DecideDialog({ detail, testId, onClose, run }: { detail: StaffTaskDetail; testId: string; onClose: () => void; run: Run }) {
  const max = detail.task.question.maxMarks;
  const [source, setSource] = useState<DecisionSource>("FIRST");
  const [marks, setMarks] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const firstA = detail.assessments.filter((x) => detail.tasks.find((k) => k.id === x.taskId)?.round === "FIRST" && x.status !== "ABANDONED").at(-1);
  const secondA = detail.assessments.filter((x) => detail.tasks.find((k) => k.id === x.taskId && k.round === "SECOND" && k.cycle === detail.task.currentCycle)).at(-1);
  return (
    <DialogFrame title="Decide the marks" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const p = reasonProblem(reason);
        const m = source === "ADJUSTED" ? parseQuestionMarks(marks, max) : null;
        if (m && (!m.ok || m.marks === null)) { setErr(m.ok ? `Enter the marks (0 to ${max}).` : m.error); return; }
        if (p) { setErr(p); return; }
        void run(() => staffQmApi.decide(testId, detail.task.id, { source, marks: m && m.ok && m.marks !== null ? m.marks : undefined, reason: reason.trim(), cycleSeen: detail.task.currentCycle }), "The marks were decided and the question approved.");
      }}>
        <fieldset className="space-y-2 text-sm">
          <legend className={labelCls}>Which marks count?</legend>
          <label className="flex items-center gap-2"><input type="radio" name="src" checked={source === "FIRST"} onChange={() => setSource("FIRST")} /> First marking: {firstA?.marks ?? "—"} / {max} ({name(firstA?.marker)})</label>
          <label className="flex items-center gap-2"><input type="radio" name="src" checked={source === "SECOND"} onChange={() => setSource("SECOND")} /> Second assessment: {secondA?.marks ?? "—"} / {max} ({name(secondA?.marker)})</label>
          <label className="flex items-center gap-2"><input type="radio" name="src" checked={source === "ADJUSTED"} onChange={() => setSource("ADJUSTED")} data-testid="qm-decide-adjusted" /> Other marks:</label>
          {source === "ADJUSTED" && <input inputMode="numeric" className={`${inputCls} ${inputOk} w-28`} value={marks} onChange={(e) => setMarks(e.target.value)} aria-label={`Marks out of ${max}`} data-testid="qm-decide-marks" />}
        </fieldset>
        <ReasonField value={reason} onChange={setReason} error={err} />
        <div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose}>Cancel</button><button type="submit" className={btnPrimary} data-testid="qm-decide-confirm">Decide</button></div>
      </form>
    </DialogFrame>
  );
}

function ReopenDialog({ detail, testId, onClose, run }: { detail: StaffTaskDetail; testId: string; onClose: () => void; run: Run }) {
  const [to, setTo] = useState<"RETURNED" | "SUBMITTED">("SUBMITTED");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <DialogFrame title="Reopen this approved question?" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const p = reasonProblem(reason); if (p) { setErr(p); return; } void run(() => staffQmApi.reopen(testId, detail.task.id, { reason: reason.trim(), to }), "Reopened. If the result was published, it was withdrawn and the student told."); }}>
        <p className="text-sm text-gray-700">The decision is kept in the history. If the paper&apos;s result was published, it is withdrawn until the paper is approved again.</p>
        <fieldset className="space-y-2 text-sm">
          <legend className={labelCls}>Then</legend>
          <label className="flex items-center gap-2"><input type="radio" name="to" checked={to === "SUBMITTED"} onChange={() => setTo("SUBMITTED")} /> Review it again</label>
          <label className="flex items-center gap-2"><input type="radio" name="to" checked={to === "RETURNED"} onChange={() => setTo("RETURNED")} /> Return it to the coach</label>
        </fieldset>
        <ReasonField value={reason} onChange={setReason} error={err} />
        <div className="flex justify-end gap-2"><button type="button" className={btnSecondary} onClick={onClose}>Cancel</button><button type="submit" className={btnPrimary} data-testid="qm-reopen-confirm">Reopen</button></div>
      </form>
    </DialogFrame>
  );
}

// ── Super Administrator corrections ──────────────────────────────────────────────────────────────────────────────────

function CorrectionsSection({ testId, onNotice }: { testId: string; onNotice: (n: { tone: "success" | "error" | "info"; text: string }) => void }) {
  const qc = useQueryClient();
  const m = useQuery({ queryKey: queryKeys.tests.qmMarkers(testId), queryFn: () => staffQmApi.markers(testId) });
  const [questionId, setQuestionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const p = reasonProblem(reason);
    if (!questionId || !prompt.trim() || p) { setErr(p ?? "Choose the question and write its corrected wording."); return; }
    setBusy(true); setErr(null);
    try {
      await staffQmApi.correctWording(testId, questionId, { prompt: prompt.trim(), reason: reason.trim() });
      onNotice({ tone: "success", text: "The wording was corrected. Coaches marking this question are told to read it again." });
      setPrompt(""); setReason(""); setQuestionId("");
      await qc.invalidateQueries({ queryKey: queryKeys.tests.all });
    } catch (e) {
      setErr(refusal(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Corrections (Super Administrators)" testId="qm-corrections">
      <p className="text-sm text-gray-700">After marking has started, only a Super Administrator can correct a question&apos;s wording or the questions&apos; marks and order, with a reason. The earlier values are kept in the history.</p>
      {m.data && (
        <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4">
          <label className="block text-sm"><span className={labelCls}>Question</span>
            <select className={`${inputCls} ${inputOk} min-h-10`} value={questionId} onChange={(e) => setQuestionId(e.target.value)} data-testid="qm-correct-question">
              <option value="">Choose…</option>
              {m.data.questions.map((q) => <option key={q.id} value={q.id}>Question {q.order}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className={labelCls}>Corrected wording</span>
            <textarea rows={3} className={`${inputCls} ${inputOk}`} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="qm-correct-prompt" />
          </label>
          <ReasonField value={reason} onChange={setReason} error={err} />
          <button type="button" className={btnPrimary} disabled={busy} onClick={() => void submit()} data-testid="qm-correct-submit">{busy ? "Saving…" : "Correct the wording"}</button>
        </div>
      )}
      {m.data && <StructureCorrection key={m.data.questions.map((q) => `${q.id}:${q.order}:${q.maxMarks}`).join("|")} testId={testId} questions={m.data.questions} onNotice={onNotice} />}
    </Section>
  );
}

function StructureCorrection({ testId, questions, onNotice }: {
  testId: string; questions: QmMarkers["questions"]; onNotice: (n: { tone: "success" | "error" | "info"; text: string }) => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(questions.map((q) => ({ id: q.id, order: String(q.order), maxMarks: String(q.maxMarks) })));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = rows.reduce((n, r) => n + (Number(r.maxMarks) || 0), 0);
  const submit = async () => {
    const p = reasonProblem(reason);
    const parsed = rows.map((r) => ({ id: r.id, order: Number(r.order), maxMarks: Number(r.maxMarks) }));
    if (parsed.some((r) => !Number.isInteger(r.order) || r.order < 1 || !Number.isInteger(r.maxMarks) || r.maxMarks < 1)) { setErr("Each question needs a whole order from 1 and marks of at least 1."); return; }
    if (new Set(parsed.map((r) => r.order)).size !== parsed.length) { setErr("Two questions cannot have the same order."); return; }
    if (p) { setErr(p); return; }
    setBusy(true); setErr(null);
    try {
      await staffQmApi.correctStructure(testId, { questions: parsed, maxMarks: total, reason: reason.trim() });
      onNotice({ tone: "success", text: `The questions were corrected; the test is now out of ${total}.` });
      setReason("");
      await qc.invalidateQueries({ queryKey: queryKeys.tests.all });
    } catch (e) {
      setErr(refusal(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-white p-4" data-testid="qm-structure">
      <p className="text-sm font-semibold text-gray-900">Marks and order of the questions</p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-end gap-2 text-sm">
            <label><span className={labelCls}>Order</span><input inputMode="numeric" className={`${inputCls} ${inputOk} w-20`} value={r.order} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, order: e.target.value } : x)))} /></label>
            <label><span className={labelCls}>Marks</span><input inputMode="numeric" className={`${inputCls} ${inputOk} w-24`} value={r.maxMarks} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, maxMarks: e.target.value } : x)))} /></label>
            <span className="pb-2 text-xs text-gray-600">was question {questions[i].order}, out of {questions[i].maxMarks}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-gray-800">The test will be out of <span className="font-semibold">{total}</span>.</p>
      <ReasonField value={reason} onChange={setReason} error={err} />
      <button type="button" className={btnPrimary} disabled={busy} onClick={() => void submit()} data-testid="qm-structure-submit">{busy ? "Saving…" : "Correct the questions"}</button>
    </div>
  );
}
