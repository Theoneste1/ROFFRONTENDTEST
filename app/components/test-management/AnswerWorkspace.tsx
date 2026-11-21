"use client";

/**
 * Answering a test (Test Management Phase 2): the student's own page (`/student/tests/:id`) and a teacher's page for one
 * of their students (`/teacher/tests/:id/students/:studentId`, G2) share this screen:
 *   - the test, the deadline that applies (extension included — computed by the server from its own clock), the paper
 *     and the questions once it is open;
 *   - the answer: typed and/or pages (a PDF, or a photo of each page). Pages go up ONE AT A TIME with their own status;
 *     a weak connection retries a page automatically, then offers Retry for that page alone. The pages of an attempt
 *     belong to it until it is submitted; a reload resumes them (the attempt's key is remembered in this tab);
 *   - submitting twice (a double tap, a lost answer) never creates a second version: the attempt's key makes it
 *     idempotent. Replacing before the deadline creates a new version; every version stays listed.
 * Works on a phone: one column, large controls, a camera button.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle2, Clock, FilePlus2, Loader2, Lock, RotateCcw, Trash2, XCircle } from "lucide-react";
import { answersApi, type AnswerTarget, type AnswerVersion, type AnswerView } from "@/lib/api/test-submissions";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { Permission } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { formatDateTime, formatFileSize, personName } from "@/lib/format";
import { ANSWER_FORMAT_LABEL, DIVISION_LABEL } from "@/lib/test-management/rules";
import {
  ANSWER_PAGE_ACCEPT, FORMAT_HELP, MAX_TYPED_ANSWER, SUBMISSION_STATUS_LABEL, WINDOW_BADGE, addPages, answerPageMode, answerProblem, formatAllows,
  newClientKey, nextQueued, pageFileProblem, queueSummary, queueText, removePage, retryDelayMs, retryFailed, setPage, shouldAutoRetry,
  uploadKeyStorageKey, type PageItem,
} from "@/lib/test-management/submissions";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Notice, btnPrimary, btnSecondary } from "@/app/admin/components/adminUi";
import { inputCls, inputOk, labelCls } from "./shared";

/** The page when the backend has no test submissions, or the user lacks the permission; otherwise the children. */
export function AnswerGate({ title, permission, children }: { title: string; permission: Permission; children: ReactNode }) {
  const { permissionsStatus, can, retry } = useSession();
  const caps = useBackendCapabilities();
  const mode = answerPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can, permission });
  if (mode === "visible") return <>{children}</>;
  return (
    <PageFrame title={title}>
      {mode === "loading" && <LoadingBlock />}
      {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retry} />}
      {mode === "unsupported" && <Notice tone="info">This server does not provide tests yet.</Notice>}
      {mode === "forbidden" && <Notice tone="info">You cannot answer tests from this account.</Notice>}
    </PageFrame>
  );
}

export function WindowBadge({ window: w }: { window: keyof typeof WINDOW_BADGE }) {
  const b = WINDOW_BADGE[w];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${b.className}`} data-testid="window-badge">{b.label}</span>;
}

const readStoredKey = (k: string): string | null => {
  try { return window.sessionStorage.getItem(k); } catch { return null; }
};
const storeKey = (k: string, v: string | null) => {
  try { if (v) window.sessionStorage.setItem(k, v); else window.sessionStorage.removeItem(k); } catch { /* private mode: nothing to resume */ }
};

export default function AnswerWorkspace({ target, backHref, backLabel, permission }: {
  target: AnswerTarget; backHref: string; backLabel: string; permission: Permission;
}) {
  return (
    <AnswerGate title="Test" permission={permission}>
      <Workspace target={target} backHref={backHref} backLabel={backLabel} />
    </AnswerGate>
  );
}

function Workspace({ target, backHref, backLabel }: { target: AnswerTarget; backHref: string; backLabel: string }) {
  const qc = useQueryClient();
  const key = queryKeys.tests.answer(target.testId, target.studentId);
  const view = useQuery({ queryKey: key, queryFn: () => answersApi.view(target) });
  const [notice, setNotice] = useState<string | null>(null);

  if (view.isPending) return <PageFrame title="Test"><LoadingBlock /></PageFrame>;
  if (view.isError) {
    const notFound = isApiError(view.error) && (view.error.status === 404 || view.error.code === "STUDENT_NOT_IN_SCOPE");
    return (
      <PageFrame title="Test">
        {notFound ? <Notice tone="info">{isApiError(view.error) && view.error.code === "STUDENT_NOT_IN_SCOPE" ? "You can submit only for students of your own schools." : "This test is not available."}</Notice>
          : <ErrorState error={view.error} title="Couldn't load the test" onRetry={() => view.refetch()} />}
        <Link href={backHref} className="text-sm font-medium text-indigo-700 hover:underline">{backLabel}</Link>
      </PageFrame>
    );
  }
  const v = view.data;
  const t = v.test;
  const forStudent = target.studentId !== null;

  return (
    <PageFrame
      title={t.title}
      description={<span className="inline-flex flex-wrap items-center gap-2"><WindowBadge window={t.window} /> {t.subject.name} · {DIVISION_LABEL[t.division]} · {t.maxMarks} marks</span>}
    >
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backLabel}
      </Link>
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="deadline-h" data-testid="answer-deadline">
            <h2 id="deadline-h" className="text-base font-bold text-slate-900">{forStudent ? `Answer for ${personName(v.student)}` : "Your answer"}</h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-600">Deadline</dt>
                <dd className="mt-0.5 font-semibold text-slate-900" data-testid="deadline">{formatDateTime(t.deadline)}</dd></div>
              <div><dt className="text-xs font-semibold uppercase tracking-wider text-slate-600">{t.window === "UPCOMING" ? "Opens" : "Answer format"}</dt>
                <dd className="mt-0.5 text-slate-900">{t.window === "UPCOMING" ? formatDateTime(t.opensAt) : ANSWER_FORMAT_LABEL[t.answerFormat]}</dd></div>
              {v.submission && (
                <div className="sm:col-span-2"><dt className="text-xs font-semibold uppercase tracking-wider text-slate-600">Status</dt>
                  <dd className="mt-0.5 text-slate-900" data-testid="submission-status">
                    {SUBMISSION_STATUS_LABEL[v.submission.status]} · {v.submission.versionCount} {v.submission.versionCount === 1 ? "version" : "versions"} · last {formatDateTime(v.submission.lastSubmittedAt)}
                  </dd></div>
              )}
            </dl>
            <p className="mt-3 text-xs text-slate-600">Times are shown in your device&apos;s time zone; the server&apos;s clock decides the deadline.</p>
            {t.window === "UPCOMING" && <div className="mt-3"><Alert tone="info">This test has not opened yet. Come back when it opens.</Alert></div>}
            {t.window === "CLOSED" && <div className="mt-3"><Alert tone="info">The deadline has passed: answers can no longer be submitted or replaced.</Alert></div>}
            {/* testSubmissionLock (owner 2026-11-21): a submitted answer is locked for the student and every teacher. */}
            {v.locked && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-800" role="status" data-testid="answer-locked">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" aria-hidden="true" />
                <span><strong>Submitted and locked.</strong> {forStudent ? "Neither you nor the student can replace it." : "It can no longer be replaced."} Only an administrator can allow it to be submitted again.</span>
              </div>
            )}
            {v.resubmission && (
              <div className="mt-3" data-testid="answer-resubmission">
                <Alert tone="info">An administrator allowed one more submission ({formatDateTime(v.resubmission.authorizedAt)}): {v.resubmission.reason}. The new version will be locked again once submitted.</Alert>
              </div>
            )}
          </section>

          {t.window !== "UPCOMING" && (t.hasPaper || t.questions.length > 0) && (
            <section className="rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="paper-h">
              <h2 id="paper-h" className="text-base font-bold text-slate-900">The test</h2>
              {t.hasPaper && (
                <div className="mt-3 max-w-md">
                  <FileButton file={{ id: `paper-${t.id}`, originalName: t.paper?.name ?? "test-paper", mimeType: t.paper?.mimeType ?? "application/pdf", size: t.paper?.size ?? 0 }} fetchFile={() => answersApi.paper(t.id, forStudent)} />
                </div>
              )}
              {t.questions.length > 0 && (
                <ol className="mt-3 space-y-2" data-testid="answer-questions">
                  {t.questions.map((q) => (
                    <li key={q.order} className="flex gap-3 text-sm">
                      <span className="font-bold text-slate-700">{q.order}.</span>
                      <span className="flex-1 whitespace-pre-wrap text-slate-900">{q.prompt}</span>
                      <span className="whitespace-nowrap text-slate-700">{q.maxMarks} {q.maxMarks === 1 ? "mark" : "marks"}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {v.canSubmit && (
            <AnswerForm view={v} target={target} onSubmitted={(next) => {
              qc.setQueryData(key, next);
              void qc.invalidateQueries({ queryKey: queryKeys.tests.all });
              const n = next.submission?.currentVersion;
              setNotice(next.replayed ? `This answer was already received (version ${n}).` : `Your answer was submitted: version ${n}.`);
            }} />
          )}
        </div>

        <Versions view={v} target={target} />
      </div>
    </PageFrame>
  );
}

function AnswerForm({ view, target, onSubmitted }: { view: AnswerView; target: AnswerTarget; onSubmitted: (v: AnswerView) => void }) {
  const ids = useId();
  const qc = useQueryClient();
  const t = view.test;
  const allows = formatAllows(t.answerFormat);
  const storage = uploadKeyStorageKey(target.testId, target.studentId);
  const [clientKey, setClientKey] = useState<string>(() => readStoredKey(storage) ?? newClientKey());
  const [items, setItems] = useState<PageItem[]>([]);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const files = useRef(new Map<string, File>());
  /** The page being sent (one at a time, whatever re-renders happen meanwhile). */
  const inFlight = useRef<string | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const summary = queueSummary(items);
  const replacing = !!view.submission;

  useEffect(() => { storeKey(storage, clientKey); }, [storage, clientKey]);

  // Resume an attempt after a reload: pages already uploaded under the remembered key.
  useEffect(() => {
    if (!allows.upload) return;
    let live = true;
    answersApi.pending(target, clientKey).then((p) => {
      if (!live || p.pages.length === 0) return;
      setItems((cur) => (cur.length ? cur : p.pages.map((x) => ({ id: `server-${x.page}`, page: x.page, name: x.name, size: x.size, status: "done" as const, attempts: 0 }))));
    }, () => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per attempt key
  }, [clientKey]);

  // One page at a time: the first queued page goes up when nothing else is uploading.
  useEffect(() => {
    if (inFlight.current || items.some((x) => x.status === "uploading")) return;
    const next = nextQueued(items);
    if (!next) return;
    const file = files.current.get(next.id);
    if (!file) {
      setItems((s) => setPage(s, next.page, { status: "failed", error: "Choose this page again." }));
      return;
    }
    const sentAs = next.page;
    inFlight.current = next.id;
    setItems((s) => setPage(s, sentAs, { status: "uploading" }));
    answersApi.uploadPage(target, clientKey, sentAs, file).finally(() => { inFlight.current = null; }).then(
      () => setItems((s) => s.map((x) => (x.id === next.id && x.page === sentAs && x.status === "uploading" ? { ...x, status: "done", error: undefined } : x))),
      async (e: unknown) => {
        const err = isApiError(e) ? e : null;
        if (shouldAutoRetry(err, next.attempts)) {
          await new Promise((r) => setTimeout(r, retryDelayMs(next.attempts)));
          setItems((s) => s.map((x) => (x.id === next.id && x.page === sentAs && x.status === "uploading" ? { ...x, status: "queued", attempts: x.attempts + 1 } : x)));
        } else {
          setItems((s) => s.map((x) => (x.id === next.id && x.page === sentAs ? { ...x, status: "failed", error: errorMessage(e) } : x)));
        }
      },
    );
  }, [items, target, clientKey]);

  function choose(list: FileList | null) {
    setError(null);
    const chosen = Array.from(list ?? []);
    const problems = chosen.map(pageFileProblem).filter(Boolean) as string[];
    const ok = chosen.filter((f) => !pageFileProblem(f));
    const withIds = ok.map((f) => ({ file: f, id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }));
    const res = addPages(items, withIds.map(({ file, id }) => ({ name: file.name, size: file.size, id })));
    withIds.slice(0, withIds.length - res.refused).forEach(({ file, id }) => files.current.set(id, file));
    setItems(res.items);
    if (res.refused) problems.push(`At most ${view.limits.maxPages} pages: ${res.refused} not added.`);
    if (problems.length) setError(problems.join(" "));
    if (pickRef.current) pickRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  }

  function remove(page: number) {
    const res = removePage(items, page);
    const gone = items.find((x) => x.page === page);
    if (gone) files.current.delete(gone.id);
    setItems(res.items);
    if (res.deleteOnServer) void answersApi.removePage(target, clientKey, res.deleteOnServer).catch(() => undefined);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = answerProblem(t.answerFormat, allows.typed ? typed : "", summary.done);
    if (problem) return setError(problem);
    if (!summary.ready) return setError("Wait until every page is uploaded (or remove the failed ones).");
    setError(null);
    setSending(true);
    try {
      const next = await answersApi.submit(target, {
        clientKey,
        ...(allows.typed && typed.trim() && { typedAnswer: typed }),
        ...(allows.upload && { pageCount: items.length }),
      });
      files.current.clear();
      setItems([]);
      setTyped("");
      setClientKey(newClientKey());
      onSubmitted(next);
    } catch (err) {
      if (isApiError(err) && err.code === "PAGES_INCOMPLETE") {
        const missing = ((err.details as { missing?: number[] } | undefined)?.missing ?? []);
        setItems((s) => s.map((x) => (missing.includes(x.page) ? { ...x, status: files.current.has(x.id) ? "queued" : "failed", attempts: 0, error: "Upload this page again." } : x)));
      }
      if (isApiError(err) && err.code === "UPLOAD_ALREADY_SUBMITTED") setClientKey(newClientKey());
      // Submitted meanwhile by someone else (the student or a teacher): show the locked answer.
      if (isApiError(err) && err.code === "SUBMISSION_LOCKED") void qc.invalidateQueries({ queryKey: queryKeys.tests.answer(target.testId, target.studentId) });
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl bg-white p-5 shadow-sm" aria-labelledby={`${ids}-h`} data-testid="answer-form">
      <div>
        <h2 id={`${ids}-h`} className="text-base font-bold text-slate-900">{replacing ? "Replace the answer" : "Submit the answer"}</h2>
        <p className="mt-0.5 text-xs text-slate-700">{FORMAT_HELP[t.answerFormat]}{replacing && " A replacement becomes a new version; the earlier versions are kept."}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {allows.typed && (
        <div>
          <label htmlFor={`${ids}-typed`} className={labelCls}>Typed answer</label>
          <textarea id={`${ids}-typed`} rows={8} maxLength={MAX_TYPED_ANSWER} className={`${inputCls} ${inputOk} text-base sm:text-sm`} value={typed}
            onChange={(e) => setTyped(e.target.value)} aria-describedby={`${ids}-typed-n`} data-testid="typed-answer" />
          <p id={`${ids}-typed-n`} className="mt-1 text-xs text-slate-600">{typed.length.toLocaleString("en-GB")} / {MAX_TYPED_ANSWER.toLocaleString("en-GB")} characters</p>
        </div>
      )}
      {allows.upload && (
        <div className="space-y-3">
          <p className={labelCls}>Pages</p>
          <div className="flex flex-wrap gap-2">
            <label htmlFor={`${ids}-camera`} className={`${btnSecondary} cursor-pointer`}><Camera className="h-4 w-4" aria-hidden="true" /> Take a photo</label>
            <input ref={cameraRef} id={`${ids}-camera`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => choose(e.target.files)}
              aria-label="Take a photo of a page" />
            <label htmlFor={`${ids}-pick`} className={`${btnSecondary} cursor-pointer`}><FilePlus2 className="h-4 w-4" aria-hidden="true" /> Add pages</label>
            <input ref={pickRef} id={`${ids}-pick`} type="file" multiple accept={ANSWER_PAGE_ACCEPT} className="sr-only" onChange={(e) => choose(e.target.files)}
              aria-label="Add pages (PDF or photos)" data-testid="add-pages" />
          </div>
          <p className="text-xs text-slate-600">One page per photo, in order. PDF or images, at most 20 MB each, {view.limits.maxPages} pages.</p>
          <p className="text-sm font-medium text-slate-800" aria-live="polite" data-testid="upload-summary">{queueText(items)}</p>
          {items.length > 0 && (
            <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200" data-testid="page-list">
              {items.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm" data-testid={`page-${x.page}`} data-status={x.status}>
                  <span className="font-bold text-slate-700">Page {x.page}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700" title={x.name}>{x.name} <span className="text-slate-500">({formatFileSize(x.size)})</span></span>
                  <PageState item={x} />
                  {x.status === "failed" && !x.id.startsWith("server-") && (
                    <button type="button" className={btnSecondary} onClick={() => setItems((s) => retryFailed(s, x.page))} aria-label={`Retry page ${x.page}`} data-testid={`retry-page-${x.page}`}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry
                    </button>
                  )}
                  <button type="button" className="rounded-lg p-2 text-red-700 hover:bg-red-50 disabled:opacity-40" disabled={summary.busy || sending}
                    onClick={() => remove(x.page)} aria-label={`Remove page ${x.page}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {x.error && <p className="basis-full text-xs text-red-700">{x.error}</p>}
                </li>
              ))}
            </ol>
          )}
          {summary.failed > 1 && <button type="button" className={btnSecondary} onClick={() => setItems((s) => retryFailed(s, null))}>Retry the failed pages</button>}
        </div>
      )}
      <div className="flex justify-end">
        <button type="submit" className={`${btnPrimary} w-full justify-center sm:w-auto`} disabled={sending || summary.busy} data-testid="submit-answer">
          {sending ? "Submitting…" : replacing ? "Submit as a new version" : "Submit"}
        </button>
      </div>
    </form>
  );
}

function PageState({ item }: { item: PageItem }) {
  switch (item.status) {
    case "queued": return <span className="inline-flex items-center gap-1 text-xs text-slate-700"><Clock className="h-4 w-4" aria-hidden="true" /> Waiting</span>;
    case "uploading": return <span className="inline-flex items-center gap-1 text-xs text-indigo-800"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Uploading{item.attempts ? ` (try ${item.attempts + 1})` : ""}</span>;
    case "done": return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Uploaded</span>;
    case "failed": return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><XCircle className="h-4 w-4" aria-hidden="true" /> Failed</span>;
  }
}

function Versions({ view, target }: { view: AnswerView; target: AnswerTarget }) {
  const versions = view.submission?.versions ?? [];
  return (
    <section className="h-fit rounded-2xl bg-white p-5 shadow-sm" aria-labelledby="versions-h" data-testid="versions">
      <h2 id="versions-h" className="text-base font-bold text-slate-900">Versions</h2>
      {versions.length === 0 ? (
        <p className="mt-2 text-sm text-slate-700">Nothing submitted yet.</p>
      ) : (
        <ol className="mt-3 space-y-4">
          {versions.map((v) => <VersionItem key={v.id} v={v} current={v.number === view.submission?.currentVersion} target={target} />)}
        </ol>
      )}
    </section>
  );
}

function VersionItem({ v, current, target }: { v: AnswerVersion; current: boolean; target: AnswerTarget }) {
  return (
    <li className="rounded-xl border border-slate-200 p-3" data-testid={`version-${v.number}`}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        Version {v.number}
        {current && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-900">Current</span>}
      </p>
      <p className="mt-0.5 text-xs text-slate-700">
        {formatDateTime(v.submittedAt)} · by {personName(v.submittedBy)}{v.submitterRole === "TEACHER" ? " (teacher)" : ""}
      </p>
      {v.typedAnswer && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-indigo-800">Typed answer</summary>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-sm text-slate-900">{v.typedAnswer}</p>
        </details>
      )}
      {v.pages.length > 0 && (
        <ul className="mt-2 space-y-2">
          {v.pages.map((p) => (
            <li key={p.page}>
              <FileButton file={{ id: `${v.id}-${p.page}`, originalName: p.name, mimeType: p.mimeType, size: p.size }} fetchFile={() => answersApi.page(target, v.id, p.page)} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
