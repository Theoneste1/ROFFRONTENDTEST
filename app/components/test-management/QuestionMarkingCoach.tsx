"use client";

/**
 * Question-level marking for COACHES (capability questionMarking, tests.mark; design Rev 5.2):
 *   - QuestionQueueSection (on `/mentor/marking`, above the paper queue): "By question" — the questions I may mark, with
 *     the saved "Show" choice (To mark / Mine now / Returned to me / Marked by me / All), a test and a question filter.
 *     A question another coach is marking shows as "Taken by another coach" (no name). "Take" claims it (atomic: a
 *     second coach gets a clear "taken a moment ago"); at most 3 at once.
 *   - QuestionWorkspace (`/mentor/marking/q/:code/:ref`): "You are marking Question 2 of 5" — the WHOLE answer paper on
 *     the left (every page; the coach is told which question to mark, not limited to it), the question, its maximum and
 *     my marks on the right. Save, Submit (this question only), Give back, Next. While the page is open a heartbeat
 *     keeps the hold every 2 minutes; when the hold ends (away > 30 minutes, given back, released by staff, reassigned,
 *     authorisation removed) the page turns read only and says why and what to do.
 * Blind: only the paper code and question number are ever shown; files arrive under neutral names.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { coachQmApi, type CoachQueue, type CoachTask, type CoachTaskDetail, type CoachView } from "@/lib/api/question-marking";
import { UserFacingError, errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import {
  COACH_STATE_BADGE, COACH_VIEWS, COMMENT_MAX, LOCK_MINUTES, MAX_ACTIVE, coachAction, coachQueueVisible, coachRefusal, heartbeatMs,
  lostMessage, minutesLeft, parseQuestionMarks, readCoachView, refLabel, saveCoachView, submitProblem, workspacePath, TESTS_MARK,
} from "@/lib/test-management/question-marking";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { ConfirmDialog, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { PaperViewer } from "@/app/components/marking/PaperViewer";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

const backLink = "inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-[#00428C] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C]";
const pill = (on: boolean) =>
  `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] ${on ? "border-[#00428C] bg-[#00428C] text-white" : "border-gray-200 bg-white text-gray-800 hover:border-[#00428C]"}`;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The plain-words message of a coach refusal (the backend's code), or the server's own text. */
function refusal(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === "CLAIM_LOST") return lostMessage((e.details as { reason?: string } | undefined)?.reason);
    return coachRefusal(e.code) ?? errorMessage(e);
  }
  return errorMessage(e);
}

function StateBadge({ state }: { state: CoachTask["state"] }) {
  const b = COACH_STATE_BADGE[state];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.className}`} data-testid="qm-state">{b.label}</span>;
}

// ── The queue ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Shown on the coach's Marking page when the server marks by question and the coach may mark. */
export function QuestionQueueSection() {
  const { can, permissionsStatus } = useSession();
  const caps = useBackendCapabilities();
  if (!coachQueueVisible(caps.detection, permissionsStatus === "ready" && can(TESTS_MARK))) return null;
  return <QuestionQueue />;
}

function QuestionQueue() {
  const { user } = useSession();
  const userId = user?.id ?? "";
  const router = useRouter();
  const qc = useQueryClient();
  const saved = useMemo(() => (userId ? readCoachView(browserStorage(), userId) : null), [userId]);
  const [chosen, setChosen] = useState<CoachView | null>(null);
  const view = chosen ?? saved;
  const [testId, setTestId] = useState("");
  const [question, setQuestion] = useState("");
  const [page, setPage] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const chooseView = (v: CoachView) => { setChosen(v); setPage(1); if (userId) saveCoachView(browserStorage(), userId, v); };
  const filters = { view: view ?? undefined, testId: testId || undefined, question: question ? Number(question) : undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.qmQueue(filters), queryFn: () => coachQmApi.queue(filters), placeholderData: keepPreviousData, enabled: view !== null });
  const take = useMutation({
    mutationFn: (r: CoachTask) => coachQmApi.claim(r.code, r.ref),
    onSuccess: (d) => { qc.setQueryData(queryKeys.tests.qmTask(d.code, d.ref), d); router.push(workspacePath(d.code, d.ref)); },
    onError: (e) => { setProblem(refusal(e)); void qc.invalidateQueries({ queryKey: queryKeys.tests.qmQueue() }); },
  });
  const data = list.data;
  // Nothing to do by question at all (no test of mine is marked by question): the section stays out of the way.
  if (data && data.counts.ALL === 0 && !testId && !question && view === "TO_MARK") return null;
  const mine = data?.counts.MINE ?? 0;
  return (
    <section className="mb-10" aria-labelledby="qm-queue-title" data-testid="qm-queue">
      <h2 id="qm-queue-title" className="text-lg font-bold text-gray-900">By question</h2>
      <p className="mt-1 text-sm text-gray-600">
        Take one question of one paper at a time. You see the whole paper and mark only that question. You can hold {MAX_ACTIVE} at once; a question you
        leave for more than {LOCK_MINUTES} minutes goes back to the list.
      </p>
      {problem && <div className="mt-3"><Notice tone="error" onClose={() => setProblem(null)}>{problem}</Notice></div>}
      {view && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Show">
          {COACH_VIEWS.map((o) => (
            <button key={o.value} type="button" className={pill(view === o.value)} aria-pressed={view === o.value} onClick={() => chooseView(o.value)} data-testid={`qm-view-${o.value}`}>
              {o.label}{data ? <span className="tabular-nums">({data.counts[o.value]})</span> : null}
            </button>
          ))}
        </div>
      )}
      {data && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className={labelCls}>Test</span>
            <select className={`${inputCls} ${inputOk} min-h-10`} value={testId} onChange={(e) => { setTestId(e.target.value); setPage(1); }} data-testid="qm-test-filter">
              <option value="">All tests</option>
              {data.tests.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.subject}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className={labelCls}>Question</span>
            <input className={`${inputCls} ${inputOk} min-h-10 w-24`} inputMode="numeric" value={question} placeholder="Any"
              onChange={(e) => { setQuestion(e.target.value.replace(/\D/g, "").slice(0, 3)); setPage(1); }} data-testid="qm-question-filter" aria-describedby="qm-question-hint" />
            <span id="qm-question-hint" className="sr-only">The question number, or empty for every question</span>
          </label>
          {mine >= MAX_ACTIVE && <Alert tone="info">You hold {MAX_ACTIVE} questions: submit or give one back to take another.</Alert>}
        </div>
      )}
      <div className="mt-4">
        {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load your questions" onRetry={() => list.refetch()} /> : data!.data.length === 0 ? (
          <EmptyState title={view === "TO_MARK" ? "No question to mark" : "Nothing here"} description={view === "TO_MARK" ? "Every question you may mark is taken or marked. New ones appear when papers are ready." : "Choose another Show option."} />
        ) : (
          <QueueRows data={data!} busy={take.isPending ? take.variables : undefined} onTake={(r) => { setProblem(null); take.mutate(r); }} limitReached={mine >= MAX_ACTIVE} onPage={setPage} />
        )}
      </div>
    </section>
  );
}

function RowAction({ r, onTake, busy, limitReached }: { r: CoachTask; onTake: (r: CoachTask) => void; busy?: CoachTask; limitReached: boolean }) {
  const a = coachAction(r.state);
  if (a === "continue" || a === "view") {
    return <Link href={workspacePath(r.code, r.ref)} className={btnSecondary} data-testid={`qm-open-${r.code}-${r.ref}`}>{a === "continue" ? "Continue" : "View"}</Link>;
  }
  if (a === "take") {
    const loading = busy?.code === r.code && busy.ref === r.ref;
    return (
      <button type="button" className={btnPrimary} disabled={!!busy || limitReached} onClick={() => onTake(r)} data-testid={`qm-take-${r.code}-${r.ref}`}
        title={limitReached ? `You hold ${MAX_ACTIVE} questions already` : undefined}>
        {loading ? "Taking…" : "Take"}
      </button>
    );
  }
  return <span className="text-xs text-gray-500">Not available</span>;
}

function QueueRows({ data, onTake, busy, limitReached, onPage }: { data: CoachQueue; onTake: (r: CoachTask) => void; busy?: CoachTask; limitReached: boolean; onPage: (p: number) => void }) {
  const now = useNow(30_000);
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:hidden" data-testid="qm-cards">
        {data.data.map((r) => (
          <li key={`${r.code}-${r.ref}`} className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm ${r.state === "TAKEN" ? "opacity-70" : ""}`} data-testid={`qm-card-${r.code}-${r.ref}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-base font-bold text-[#00428C]">{r.code}</p>
                <p className="text-sm font-semibold text-gray-900">{refLabel(r.ref)} · out of {r.question.maxMarks}</p>
              </div>
              <StateBadge state={r.state} />
            </div>
            <p className="mt-1 text-xs text-gray-600">{r.test.title} · {r.test.subject}</p>
            {r.state === "MINE" && r.lockExpiresAt && <p className="mt-1 text-xs text-amber-900">Held for {minutesLeft(r.lockExpiresAt, now)} more minutes</p>}
            <div className="mt-3"><RowAction r={r} onTake={onTake} busy={busy} limitReached={limitReached} /></div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <TableCard footer={<Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPage={onPage} />}>
          <thead className="bg-gray-50/80">
            <tr><th className={th}>Paper</th><th className={th}>Question</th><th className={th}>Test</th><th className={th}>Status</th><th className={th}><span className="sr-only">Action</span></th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.data.length === 0 && <TableMessage colSpan={5}>Nothing here.</TableMessage>}
            {data.data.map((r) => (
              <tr key={`${r.code}-${r.ref}`} className={r.state === "TAKEN" ? "text-gray-500" : ""} data-testid={`qm-row-${r.code}-${r.ref}`}>
                <td className={`${td} font-mono font-bold text-[#00428C]`}>{r.code}</td>
                <td className={td}>{refLabel(r.ref)} <span className="text-xs text-gray-600">· out of {r.question.maxMarks}</span></td>
                <td className={td}>{r.test.title}<span className="block text-xs text-gray-600">{r.test.subject}</span></td>
                <td className={td}>
                  <StateBadge state={r.state} />
                  {r.state === "MINE" && r.lockExpiresAt && <span className="block text-xs text-amber-900">{minutesLeft(r.lockExpiresAt, now)} min left</span>}
                </td>
                <td className={`${td} text-right`}><RowAction r={r} onTake={onTake} busy={busy} limitReached={limitReached} /></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </div>
      <div className="md:hidden"><Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={onPage} /></div>
    </>
  );
}

/** The current time, refreshed every `every` ms (for "minutes left"). */
function useNow(every: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

// ── The workspace ────────────────────────────────────────────────────────────────────────────────────────────────────

export function QuestionWorkspace({ code, refName }: { code: string; refName: string }) {
  const { can, permissionsStatus } = useSession();
  const caps = useBackendCapabilities();
  if (caps.loading || permissionsStatus === "loading") return <PageFrame title="Marking"><LoadingBlock /></PageFrame>;
  if (!coachQueueVisible(caps.detection, permissionsStatus === "ready" && can(TESTS_MARK))) {
    return <PageFrame title="Marking"><Notice tone="info">Marking by question is not available for your account on this server.</Notice></PageFrame>;
  }
  return <Workspace code={code} refName={refName} />;
}

function Workspace({ code, refName }: { code: string; refName: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const key = queryKeys.tests.qmTask(code, refName);
  const task = useQuery({ queryKey: key, queryFn: () => coachQmApi.get(code, refName), retry: false });
  const [lost, setLost] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);

  const onLost = useCallback((e: unknown) => {
    if (isApiError(e) && e.code === "CLAIM_LOST") { setLost(lostMessage((e.details as { reason?: string } | undefined)?.reason)); return true; }
    return false;
  }, []);

  const d = task.data;
  const live = !!d?.canEdit && !lost;

  // Heartbeat while the page is visible and I hold the question.
  useHeartbeat(live ? d : null, (e) => { if (!onLost(e)) setNotice({ tone: "error", text: "Couldn't reach the server to keep this question. Check your connection; your hold lasts 30 minutes." }); });

  const next = useMutation({
    mutationFn: async () => {
      const q = await coachQmApi.queue({ view: "TO_MARK", testId: d?.test.id, limit: 50 });
      const mineOther = q.data.find((r) => (r.state === "MINE" || r.state === "RETURNED_TO_ME") && !(r.code === code && r.ref === refName));
      if (mineOther) return mineOther;
      const sameQuestion = q.data.find((r) => r.state === "AVAILABLE" && r.question.order === d?.question.order);
      const any = sameQuestion ?? q.data.find((r) => r.state === "AVAILABLE");
      if (!any) throw new UserFacingError("Nothing else is waiting for you in this test. Go back to the list to see the other tests.");
      return coachQmApi.claim(any.code, any.ref).then((x) => ({ code: x.code, ref: x.ref }));
    },
    onSuccess: (r) => router.push(workspacePath(r.code, r.ref)),
    onError: (e) => setNotice({ tone: "error", text: refusal(e) }),
  });

  if (task.isPending) return <PageFrame title="Marking"><LoadingBlock /></PageFrame>;
  if (task.isError) {
    const message = isApiError(task.error) && (task.error.code === "CLAIM_LOST" || task.error.code === "TASK_NOT_HELD" || task.error.code === "TASK_NOT_FOUND")
      ? (task.error.code === "CLAIM_LOST" ? lostMessage((task.error.details as { reason?: string } | undefined)?.reason) : task.error.code === "TASK_NOT_FOUND" ? "This question does not exist. Check the link or go back to the list." : "Take this question from the list first.")
      : null;
    return (
      <PageFrame title="Marking">
        <Link href="/mentor/marking" className={backLink}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the list</Link>
        <div className="mt-4">{message ? <Notice tone="info">{message}</Notice> : <ErrorState error={task.error} title="Couldn't open this question" onRetry={() => task.refetch()} />}</div>
      </PageFrame>
    );
  }
  const t = d!;
  const pages = t.answer.pages.map((p) => ({ page: p.pageNumber, name: p.name, mimeType: p.mimeType, size: p.size }));
  return (
    <PageFrame
      title={`You are marking ${refLabel(t.ref)} of ${t.test.questionCount}`}
      description={<span>Paper <span className="font-mono font-bold text-[#00428C]">{t.code}</span> · {t.test.title} · {t.test.subject}</span>}
    >
      <Link href="/mentor/marking" className={backLink}><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to the list</Link>
      <div className="mt-4 space-y-3" aria-live="polite">
        {lost && <Notice tone="info"><span data-testid="qm-lost">{lost}</span></Notice>}
        {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        {t.wordingChanged && <Alert tone="info">The wording of this question was corrected after you started. Read it again before submitting.</Alert>}
        {t.returnReason && <Alert tone="info"><span className="font-semibold">Returned to you:</span> {t.returnReason}</Alert>}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <PaperViewer pages={pages} typedAnswer={t.answer.typedAnswer} queryKey={[...queryKeys.tests.qmTask(t.code, t.ref), "page"]}
            fetchPage={(n) => coachQmApi.page(t.code, t.ref, n)} title="The whole answer paper" />
        </div>
        <aside className="space-y-4" aria-label="Marks for this question">
          <div className="rounded-xl border-2 border-[#00428C] bg-white p-4" data-testid="qm-question">
            <p className="text-xs font-bold uppercase tracking-wide text-[#00428C]">{refLabel(t.ref)} of {t.test.questionCount} · out of {t.question.maxMarks}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">{t.question.prompt}</p>
            <p className="mt-2 text-xs text-gray-600">Mark only this question. The other questions of this paper are marked separately.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.test.hasPaper && <div className="text-sm"><span className="block text-xs font-semibold text-gray-700">Question paper</span><FileButton file={{ id: `${t.code}-paper`, originalName: "test-paper", mimeType: "application/octet-stream", size: 0 }} fetchFile={() => coachQmApi.paper(t.code, t.ref)} /></div>}
            {t.test.hasMarkingGuide && <div className="text-sm"><span className="block text-xs font-semibold text-gray-700">Marking guide</span><FileButton file={{ id: `${t.code}-guide`, originalName: "marking-guide", mimeType: "application/octet-stream", size: 0 }} fetchFile={() => coachQmApi.markingGuide(t.code, t.ref)} /></div>}
          </div>
          <MarksForm key={`${t.code}-${t.ref}-${t.myAssessment?.revision ?? 0}-${lost ? "lost" : "live"}`} task={t} live={live}
            onSaved={(x, text) => { qc.setQueryData(key, x); setNotice({ tone: "success", text }); void qc.invalidateQueries({ queryKey: queryKeys.tests.qmQueue() }); }}
            onError={(e) => { if (!onLost(e)) setNotice({ tone: "error", text: refusal(e) }); }} />
          {live && (
            <button type="button" className={`${btnSecondary} w-full`} onClick={() => setConfirmRelease(true)} data-testid="qm-release">Give this question back</button>
          )}
          <button type="button" className={`${btnSecondary} w-full`} disabled={next.isPending} onClick={() => next.mutate()} data-testid="qm-next">
            {next.isPending ? "Finding the next question…" : <>Next question <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
          </button>
          {live && t.lockExpiresAt && <p className="text-xs text-gray-600">Held for you until {formatDateTime(t.lockExpiresAt)} (renewed while this page is open).</p>}
        </aside>
      </div>
      {confirmRelease && (
        <ConfirmDialog title="Give this question back?" body="Another coach can then take it. Your draft is not passed on: whoever takes it starts with empty marks."
          confirmLabel="Give back" onClose={() => setConfirmRelease(false)}
          onConfirm={async () => {
            try {
              await coachQmApi.release(t.code, t.ref);
              setConfirmRelease(false);
              await qc.invalidateQueries({ queryKey: queryKeys.tests.qmQueue() });
              router.push("/mentor/marking");
            } catch (e) {
              setConfirmRelease(false);
              if (!onLost(e)) setNotice({ tone: "error", text: refusal(e) });
            }
          }} />
      )}
    </PageFrame>
  );
}

/** Keeps the hold alive every heartbeatSeconds while the tab is visible (and once more when it becomes visible). */
function useHeartbeat(task: CoachTaskDetail | null, onError: (e: unknown) => void) {
  const code = task?.code;
  const ref = task?.ref;
  const every = heartbeatMs(task?.heartbeatSeconds);
  const errRef = useRef(onError);
  useEffect(() => { errRef.current = onError; }, [onError]);
  useEffect(() => {
    if (!code || !ref) return;
    let stopped = false;
    const beat = () => {
      if (stopped || (typeof document !== "undefined" && document.visibilityState !== "visible")) return;
      coachQmApi.heartbeat(code, ref).catch((e) => { if (!stopped) errRef.current(e); });
    };
    const timer = window.setInterval(beat, every);
    const onVisible = () => { if (document.visibilityState === "visible") beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [code, ref, every]);
}

function MarksForm({ task, live, onSaved, onError }: {
  task: CoachTaskDetail; live: boolean;
  onSaved: (t: CoachTaskDetail, text: string) => void; onError: (e: unknown) => void;
}) {
  const id = useId();
  const max = task.question.maxMarks;
  const mine = task.myAssessment;
  const [marks, setMarks] = useState(mine?.marks === null || mine?.marks === undefined ? "" : String(mine.marks));
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const parsed = parseQuestionMarks(marks, max);
  const fieldError = parsed.ok ? null : parsed.error;
  const quick = max <= 10;

  const send = async (kind: "save" | "submit") => {
    setError(null);
    if (!parsed.ok) { setError(parsed.error); return; }
    if (kind === "submit") {
      const p = submitProblem(parsed.marks, comment);
      if (p) { setError(p); return; }
    }
    setBusy(kind);
    try {
      const body = { marks: parsed.marks, comment: comment.trim() === "" ? null : comment, expectedRevision: mine?.revision };
      const out = kind === "save" ? await coachQmApi.save(task.code, task.ref, body) : await coachQmApi.submit(task.code, task.ref, body);
      onSaved(out, kind === "save" ? "Your marks were saved as a draft." : "Submitted. This question goes to the Head Coach for review and leaves your list.");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  if (!live) {
    return (
      <div className="rounded-xl border border-gray-100 bg-slate-50 p-4 text-sm" data-testid="qm-readonly">
        <p className="font-semibold text-gray-900">Your marks</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{mine?.marks ?? "—"} <span className="text-sm font-normal text-gray-600">/ {max}</span></p>
        {mine?.comment && <p className="mt-2 whitespace-pre-wrap text-gray-800">{mine.comment}</p>}
        <p className="mt-2 text-xs text-gray-600">Read only.</p>
      </div>
    );
  }
  return (
    <form className="space-y-3 rounded-xl border border-gray-100 bg-white p-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void send("submit"); }} noValidate data-testid="qm-form">
      {quick && (
        <div role="group" aria-label={`Quick marks, 0 to ${max}`} className="flex flex-wrap gap-1.5">
          {Array.from({ length: max + 1 }, (_, n) => (
            <button key={n} type="button" aria-pressed={marks === String(n)} onClick={() => setMarks(String(n))}
              className={`h-10 min-w-10 rounded-lg border text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] ${marks === String(n) ? "border-[#00428C] bg-[#00428C] text-white" : "border-gray-200 bg-white text-gray-900 hover:border-[#00428C]"}`}
              data-testid={`qm-quick-${n}`}>{n}</button>
          ))}
        </div>
      )}
      <div>
        <label htmlFor={`${id}-marks`} className={labelCls}>Marks (out of {max})</label>
        <input id={`${id}-marks`} inputMode="numeric" className={`${inputCls} ${fieldError ? inputBad : inputOk}`} value={marks}
          onChange={(e) => setMarks(e.target.value)} aria-invalid={!!fieldError} aria-describedby={fieldError ? `${id}-marks-err` : undefined} data-testid="qm-marks" />
        {fieldError && <p id={`${id}-marks-err`} className="mt-1 text-sm text-red-700">{fieldError}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-comment`} className={labelCls}>Comment (optional)</label>
        <textarea id={`${id}-comment`} rows={3} maxLength={COMMENT_MAX} className={`${inputCls} ${inputOk}`} value={comment} onChange={(e) => setComment(e.target.value)} data-testid="qm-comment" />
      </div>
      {error && <p className="text-sm font-medium text-red-700" role="alert" data-testid="qm-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => void send("save")} data-testid="qm-save">{busy === "save" ? "Saving…" : "Save draft"}</button>
        <button type="submit" className={btnPrimary} disabled={!!busy} data-testid="qm-submit">{busy === "submit" ? "Submitting…" : "Submit this question"}</button>
      </div>
    </form>
  );
}
