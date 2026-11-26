"use client";

/**
 * One test (`/admin/tests/:id`, `/mentor/tests/:id`): Details (edit), Questions (add / edit / reorder / remove with the sum
 * against the maximum), Files (paper and marking guide: private, neutral names), Submissions (Phase 2 tracking and every
 * version; tests.viewSubmissions), Extensions (Phase 2; tests.extensions) and Markers (coaches authorised for the
 * subject; authorise / revoke with a reason). Phase 3 (capability testMarking): Markers & distribution (tests.distribute:
 * even distribution, assign / reassign, progress per coach — with the authorisations), Review (tests.review: side by side,
 * approve, return, second marking, choose / adjust — Head Coaches only, G4 —, unlock) and History (status changes, the
 * mark-change log, decisions). Phase 4 (capability testResults): Publishing (tests.publishResults: preview, publish,
 * the Administrators' override with a reason — tests.overridePublication; publications and withdrawals), Results
 * (tests.viewResults: report, CSV exports, results with identity) and Rankings (tests.viewRankings). Publish, unpublish
 * and delete (drafts) in the header. Once students have
 * submitted, the test keeps its essentials (the backend refuses: 409 TEST_LOCKED_BY_SUBMISSIONS / TEST_HAS_SUBMISSIONS).
 * Controls the user cannot use are hidden; the backend checks every request (a Head Coach of another subject gets 403).
 */
import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { testsApi, type TestDetail as Test, type TestFileKind, type TestQuestion } from "@/lib/api/tests";
import { UserFacingError, errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { TESTS_EXTENSIONS, TESTS_VIEW_SUBMISSIONS, staffTabVisible } from "@/lib/test-management/submissions";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, formatFileSize, hasAcceptedExtension, personName } from "@/lib/format";
import {
  ANSWER_FORMAT_LABEL, TESTS_MANAGE, TESTS_MANAGE_MARKERS, TEST_FILE_ACCEPT, TEST_FILE_MAX_BYTES, detailsChange,
  detailsDraftOf, detailsProblems, moveItem, parseMarks, publishProblemText, knownPublishProblems, questionBody, questionProblems, questionSum, sumText,
  type DetailsDraft, type DetailsField, type QuestionDraft,
} from "@/lib/test-management/rules";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { ConfirmDialog, Modal, Notice, btnDanger, btnPrimary, btnSecondary } from "@/app/admin/components/adminUi";
import { DetailsFields, StatusBadge, TestsGate, inputBad, inputCls, inputOk, labelCls } from "./shared";
import MarkersPanel from "./MarkersPanel";
import LevelName from "./LevelName";
import SubmissionsPanel from "./SubmissionsPanel";
import ExtensionsPanel from "./ExtensionsPanel";
import DistributionPanel from "./DistributionPanel";
import ReviewPanel from "./ReviewPanel";
import HistoryPanel from "./HistoryPanel";
import QuestionMarkingPanel from "./QuestionMarkingPanel";
import { staffTabVisible as qmTabVisible } from "@/lib/test-management/question-marking";
import { TESTS_DISTRIBUTE, TESTS_REVIEW, markingTabVisible } from "@/lib/test-management/marking";
import { TESTS_PUBLISH_RESULTS, TESTS_VIEW_RANKINGS, TESTS_VIEW_RESULTS, resultsTabVisible } from "@/lib/test-management/results";
import { PublishingPanel, RankingsPanel, ResultsReportPanel } from "./ResultsPanels";

type Tab = "details" | "questions" | "files" | "submissions" | "extensions" | "markers" | "question-marking" | "review" | "history" | "publishing" | "results" | "rankings";
const TABS: readonly Tab[] = ["details", "questions", "files", "submissions", "extensions", "markers", "question-marking", "review", "history", "publishing", "results", "rankings"];

export default function TestDetail({ id, base, initialTab }: { id: string; base: string; initialTab?: string }) {
  return (
    <TestsGate title="Test">
      <Detail id={id} base={base} initialTab={TABS.includes(initialTab as Tab) ? (initialTab as Tab) : undefined} />
    </TestsGate>
  );
}

function Detail({ id, base, initialTab }: { id: string; base: string; initialTab?: Tab }) {
  const { can, permissionsStatus } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const test = useQuery({ queryKey: queryKeys.tests.detail(id), queryFn: () => testsApi.get(id) });
  const [tab, setTab] = useState<Tab>(initialTab ?? "details");
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | "delete" | null>(null);
  const canManage = actionAllowed(TESTS_MANAGE, permissionsStatus, can);
  const canMarkers = actionAllowed(TESTS_MANAGE_MARKERS, permissionsStatus, can);
  const { detection } = useBackendCapabilities();
  const canSubmissions = staffTabVisible(detection, actionAllowed(TESTS_VIEW_SUBMISSIONS, permissionsStatus, can));
  const canExtensions = staffTabVisible(detection, actionAllowed(TESTS_EXTENSIONS, permissionsStatus, can));
  const canDistribute = markingTabVisible(detection, actionAllowed(TESTS_DISTRIBUTE, permissionsStatus, can));
  const canReview = markingTabVisible(detection, actionAllowed(TESTS_REVIEW, permissionsStatus, can));
  // Question-level marking (capability questionMarking): the mode, coaches per question, review per question.
  const canQuestionMarking = qmTabVisible(detection, actionAllowed(TESTS_REVIEW, permissionsStatus, can) || actionAllowed(TESTS_DISTRIBUTE, permissionsStatus, can) || canManage);
  // Phase 4 (capability testResults): Publishing, Results (report, exports), Rankings.
  const canPublish = resultsTabVisible(detection, actionAllowed(TESTS_PUBLISH_RESULTS, permissionsStatus, can));
  const canResults = resultsTabVisible(detection, actionAllowed(TESTS_VIEW_RESULTS, permissionsStatus, can));
  const canRankings = resultsTabVisible(detection, actionAllowed(TESTS_VIEW_RANKINGS, permissionsStatus, can));

  /** Every change answers with the whole test: show it and refresh the lists. */
  const apply = async (t: Test, message: string) => {
    qc.setQueryData(queryKeys.tests.detail(id), t);
    await qc.invalidateQueries({ queryKey: queryKeys.tests.list() });
    setNotice(message);
  };

  if (test.isPending) return <PageFrame title="Test"><LoadingBlock /></PageFrame>;
  if (test.isError) {
    const scope = isApiError(test.error) && test.error.code === "SCOPE_FORBIDDEN";
    return (
      <PageFrame title="Test">
        {scope ? <Notice tone="info">This test belongs to a subject you do not head.</Notice> : <ErrorState error={test.error} title="Couldn't load the test" onRetry={() => test.refetch()} />}
        <Link href={base} className="text-sm font-medium text-indigo-700 hover:underline">Back to tests</Link>
      </PageFrame>
    );
  }
  const t = test.data;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "details", label: "Details" },
    { id: "questions", label: `Questions (${t.questionCount})` },
    { id: "files", label: "Files" },
    ...(canSubmissions ? [{ id: "submissions" as const, label: t.submissionCount ? `Submissions (${t.submissionCount})` : "Submissions" }] : []),
    ...(canExtensions ? [{ id: "extensions" as const, label: "Extensions" }] : []),
    ...(canMarkers || canDistribute ? [{ id: "markers" as const, label: canDistribute ? "Markers & distribution" : "Markers" }] : []),
    ...(canQuestionMarking ? [{ id: "question-marking" as const, label: "Question marking" }] : []),
    ...(canReview ? [{ id: "review" as const, label: "Review" }, { id: "history" as const, label: "History" }] : []),
    ...(canPublish && t.status === "PUBLISHED" ? [{ id: "publishing" as const, label: "Publishing" }] : []),
    ...(canResults && t.status === "PUBLISHED" ? [{ id: "results" as const, label: "Results" }] : []),
    ...(canRankings && t.status === "PUBLISHED" ? [{ id: "rankings" as const, label: "Rankings" }] : []),
  ];
  const locked = (t.submissionCount ?? 0) > 0;

  return (
    <PageFrame
      title={t.title}
      description={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={t.status} /> {t.subject.name} · <LevelName code={t.division} /> · {t.maxMarks} marks</span>}
      actions={canManage && (
        <>
          {t.status === "DRAFT" ? (
            <>
              <button type="button" className={btnPrimary} onClick={() => setConfirm("publish")} data-testid="publish-test">Publish</button>
              <button type="button" className={btnDanger} onClick={() => setConfirm("delete")} data-testid="delete-test">Delete</button>
            </>
          ) : locked ? null : (
            <button type="button" className={btnSecondary} onClick={() => setConfirm("unpublish")} data-testid="unpublish-test">Unpublish</button>
          )}
        </>
      )}
    >
      <Link href={base} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All tests
      </Link>
      {notice && <Notice tone="success" onClose={() => setNotice(null)}>{notice}</Notice>}
      {locked && (
        <Notice tone="info">
          Students have submitted ({t.submissionCount}): the subject, division, answer format, opening time, deadline, marks, questions and paper are
          locked, and the test can no longer be unpublished or deleted. Give later deadlines with extensions. The title, question wording and marking guide can still change.
        </Notice>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab}>
        {tab === "details" && <DetailsTab test={t} canManage={canManage} onSaved={(x) => apply(x, "The details were saved.")} />}
        {tab === "questions" && <QuestionsTab test={t} canManage={canManage} onChanged={apply} />}
        {tab === "files" && <FilesTab test={t} canManage={canManage} onChanged={apply} />}
        {tab === "submissions" && canSubmissions && <SubmissionsPanel testId={t.id} />}
        {tab === "extensions" && canExtensions && <ExtensionsPanel test={t} />}
        {tab === "markers" && (
          <div className="space-y-10">
            {canDistribute && t.status === "PUBLISHED" && <DistributionPanel testId={t.id} />}
            {canMarkers && <MarkersPanel subject={t.subject} />}
          </div>
        )}
        {tab === "question-marking" && canQuestionMarking && <QuestionMarkingPanel testId={t.id} testStatus={t.status} />}
        {tab === "review" && canReview && <ReviewPanel testId={t.id} />}
        {tab === "history" && canReview && <HistoryPanel testId={t.id} />}
        {tab === "publishing" && canPublish && <PublishingPanel testId={t.id} />}
        {tab === "results" && canResults && <ResultsReportPanel testId={t.id} />}
        {tab === "rankings" && canRankings && <RankingsPanel testId={t.id} />}
      </Tabs>

      {confirm === "publish" && (
        <ConfirmDialog
          title="Publish this test?"
          body={
            <>
              Students of its division will see it in My tests, and their teachers can submit for them, from the time it opens.{" "}
              {t.questionCount > 0 && sumText(t.maxMarks, t.questionCount ? [t.questionMarksTotal] : [])}
              {knownPublishProblems(t).map((p) => (
                <span key={p} className="mt-3 block rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900" data-testid="publish-warning">
                  {publishProblemText(p, { closesAt: t.closesAt, formatTime: formatDateTime })}
                </span>
              ))}
            </>
          }
          confirmLabel="Publish"
          onConfirm={async () => {
            try {
              await apply(await testsApi.publish(id), "The test is published.");
            } catch (e) {
              const problems = isApiError(e) && e.code === "TEST_NOT_READY" ? ((e.details as { problems?: string[] } | undefined)?.problems ?? []) : [];
              // Shown as written (a plain Error would read "Something went wrong").
              if (problems.length) throw new UserFacingError(problems.map((p) => publishProblemText(p, { closesAt: t.closesAt, formatTime: formatDateTime })).join(" "));
              throw e;
            }
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === "unpublish" && (
        <ConfirmDialog title="Unpublish this test?" body="It goes back to draft." confirmLabel="Unpublish"
          onConfirm={async () => apply(await testsApi.unpublish(id), "The test is a draft again.")} onClose={() => setConfirm(null)} />
      )}
      {confirm === "delete" && (
        <ConfirmDialog title="Delete this draft?" body="The test, its questions and its files are removed. This cannot be undone." confirmLabel="Delete" tone="danger"
          onConfirm={async () => {
            await testsApi.remove(id);
            qc.removeQueries({ queryKey: queryKeys.tests.detail(id) });
            await qc.invalidateQueries({ queryKey: queryKeys.tests.list() });
            router.push(base);
          }}
          onClose={() => setConfirm(null)} />
      )}
    </PageFrame>
  );
}

/** Accessible tabs: arrow keys move between them; the panel is labelled by its tab. */
function Tabs({ tabs, value, onChange, children }: { tabs: Array<{ id: Tab; label: string }>; value: Tab; onChange: (t: Tab) => void; children: ReactNode }) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = tabs[(to + tabs.length) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label="Test sections" className="mb-4 flex flex-wrap gap-1 border-b border-slate-300">
        {tabs.map((t, i) => {
          const active = t.id === value;
          return (
            <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`${base}-${t.id}`} aria-selected={active}
              aria-controls={`${base}-panel`} tabIndex={active ? 0 : -1} onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? "border-indigo-700 text-indigo-800" : "border-transparent text-slate-700 hover:text-slate-900"}`}
              data-testid={`tab-${t.id}`}>
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-${value}`} className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
        {children}
      </div>
    </div>
  );
}

// ── Details ──────────────────────────────────────────────────────────────────

function DetailsTab({ test, canManage, onSaved }: { test: Test; canManage: boolean; onSaved: (t: Test) => void }) {
  const [draft, setDraft] = useState<DetailsDraft>(() => detailsDraftOf(test));
  const [errors, setErrors] = useState<Partial<Record<DetailsField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: ReturnType<typeof detailsChange>) => testsApi.update(test.id, body),
    onSuccess: (t) => { setDraft(detailsDraftOf(t)); onSaved(t); },
    onError: (e) => setError(errorMessage(e)),
  });
  if (!canManage) {
    return (
      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <Info label="Subject">{test.subject.name}</Info>
        <Info label="Level"><LevelName code={test.division} /></Info>
        <Info label="How students answer">{ANSWER_FORMAT_LABEL[test.answerFormat]}</Info>
        <Info label="Maximum marks">{test.maxMarks}</Info>
        <Info label="Opens">{formatDateTime(test.opensAt)}</Info>
        <Info label="Closes">{formatDateTime(test.closesAt)}</Info>
      </dl>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const p = detailsProblems(draft);
    setErrors(p);
    if (Object.keys(p).length) return;
    const body = detailsChange(test, draft);
    if (Object.keys(body).length === 0) return setError("Nothing changed.");
    setError(null);
    save.mutate(body);
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="test-details-form">
      {error && <Alert tone="error">{error}</Alert>}
      <DetailsFields draft={draft} onChange={setDraft} errors={errors} subjectLocked={test.status !== "DRAFT"} />
      <p className="text-xs text-slate-600">
        Created {formatDateTime(test.createdAt)}{test.createdBy && ` by ${personName(test.createdBy)}`}.
        {test.deadlineMoved && <> The deadline was moved: originally {formatDateTime(test.originalClosesAt)}.</>}
      </p>
      <div className="flex justify-end">
        <button type="submit" className={btnPrimary} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save details"}</button>
      </div>
    </form>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}

// ── Questions ────────────────────────────────────────────────────────────────

function QuestionsTab({ test, canManage, onChanged }: { test: Test; canManage: boolean; onChanged: (t: Test, message: string) => void }) {
  const [editing, setEditing] = useState<TestQuestion | "new" | null>(null);
  const [removing, setRemoving] = useState<TestQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const marks = test.questions.map((q) => q.maxMarks);
  const sum = questionSum(test.maxMarks, marks);
  const move = useMutation({
    mutationFn: (ids: string[]) => testsApi.reorderQuestions(test.id, ids),
    onSuccess: (t) => onChanged(t, "The questions were reordered."),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <p className={`text-sm font-semibold ${sum.complete ? "text-slate-800" : "text-amber-900"}`} data-testid="question-sum">{sumText(test.maxMarks, marks)}</p>
      {!sum.complete && test.status === "DRAFT" && <p className="text-xs text-slate-700">The questions must add up to the maximum before the test can be published.</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {test.questions.length === 0 ? (
        <p className="text-sm text-slate-700">No questions. The test is marked as one total.</p>
      ) : (
        <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200" data-testid="questions">
          {test.questions.map((q, i) => (
            <li key={q.id} className="flex items-start gap-3 p-3" data-testid={`question-${q.order}`}>
              <span className="mt-0.5 text-sm font-bold text-slate-700">{q.order}.</span>
              <p className="flex-1 whitespace-pre-wrap text-sm text-slate-900">{q.prompt}</p>
              <span className="whitespace-nowrap text-sm font-semibold text-slate-800">{q.maxMarks} {q.maxMarks === 1 ? "mark" : "marks"}</span>
              {canManage && (
                <div className="flex items-center gap-1">
                  <IconBtn label={`Move question ${q.order} up`} disabled={i === 0 || move.isPending} onClick={() => move.mutate(moveItem(test.questions.map((x) => x.id), i, -1))}><ArrowUp className="h-4 w-4" /></IconBtn>
                  <IconBtn label={`Move question ${q.order} down`} disabled={i === test.questions.length - 1 || move.isPending} onClick={() => move.mutate(moveItem(test.questions.map((x) => x.id), i, 1))}><ArrowDown className="h-4 w-4" /></IconBtn>
                  <IconBtn label={`Edit question ${q.order}`} onClick={() => setEditing(q)}><Pencil className="h-4 w-4" /></IconBtn>
                  <IconBtn label={`Remove question ${q.order}`} danger onClick={() => setRemoving(q)}><Trash2 className="h-4 w-4" /></IconBtn>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {canManage && <button type="button" className={btnSecondary} onClick={() => setEditing("new")} data-testid="add-question">Add a question</button>}
      {editing && (
        <QuestionDialog test={test} question={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={(t, msg) => { setEditing(null); onChanged(t, msg); }} />
      )}
      {removing && (
        <ConfirmDialog title={`Remove question ${removing.order}?`} body="The other questions are renumbered." confirmLabel="Remove" tone="danger"
          onConfirm={async () => onChanged(await testsApi.removeQuestion(test.id, removing.id), "The question was removed.")} onClose={() => setRemoving(null)} />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`rounded-lg p-1.5 disabled:opacity-40 ${danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100"}`}>
      {children}
    </button>
  );
}

function QuestionDialog({ test, question, onClose, onSaved }: { test: Test; question: TestQuestion | null; onClose: () => void; onSaved: (t: Test, message: string) => void }) {
  const ids = useId();
  const [d, setD] = useState<QuestionDraft>({ prompt: question?.prompt ?? "", maxMarks: question ? String(question.maxMarks) : "" });
  const [errors, setErrors] = useState<Partial<Record<keyof QuestionDraft, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const others = test.questions.filter((q) => q.id !== question?.id).reduce((a, q) => a + q.maxMarks, 0);
  const save = useMutation({
    mutationFn: () => {
      const body = questionBody(d);
      return question ? testsApi.updateQuestion(test.id, question.id, body) : testsApi.addQuestion(test.id, body);
    },
    onSuccess: (t) => onSaved(t, question ? "The question was saved." : "The question was added."),
    onError: (e) => setError(errorMessage(e)),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const p = questionProblems(d, test.maxMarks, others);
    setErrors(p);
    if (Object.keys(p).length) return;
    setError(null);
    save.mutate();
  }
  const left = test.maxMarks - others - (parseMarks(d.maxMarks) ?? 0);
  return (
    <Modal title={question ? `Edit question ${question.order}` : "Add a question"} onClose={onClose} wide>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="question-form">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <label htmlFor={`${ids}-prompt`} className={labelCls}>Question</label>
          <textarea id={`${ids}-prompt`} rows={4} maxLength={5000} className={`${inputCls} ${errors.prompt ? inputBad : inputOk}`} value={d.prompt}
            onChange={(e) => setD((s) => ({ ...s, prompt: e.target.value }))} aria-invalid={!!errors.prompt} aria-describedby={errors.prompt ? `${ids}-prompt-e` : undefined} />
          {errors.prompt && <p id={`${ids}-prompt-e`} className="mt-1 text-xs text-red-700">{errors.prompt}</p>}
        </div>
        <div className="max-w-[12rem]">
          <label htmlFor={`${ids}-marks`} className={labelCls}>Marks</label>
          <input id={`${ids}-marks`} inputMode="numeric" className={`${inputCls} ${errors.maxMarks ? inputBad : inputOk}`} value={d.maxMarks}
            onChange={(e) => setD((s) => ({ ...s, maxMarks: e.target.value }))} aria-invalid={!!errors.maxMarks} aria-describedby={`${ids}-marks-d`} />
          <p id={`${ids}-marks-d`} className={`mt-1 text-xs ${errors.maxMarks ? "text-red-700" : "text-slate-600"}`}>
            {errors.maxMarks ?? `Whole marks. ${Math.max(left, 0)} of the test's ${test.maxMarks} left after this question.`}
          </p>
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btnPrimary} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save question"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Files ────────────────────────────────────────────────────────────────────

const FILES: Array<{ kind: TestFileKind; key: "paper" | "markingGuide"; label: string; note: string }> = [
  { kind: "paper", key: "paper", label: "Question paper", note: "PDF or images (phone photos too), at most 20 MB." },
  { kind: "marking-guide", key: "markingGuide", label: "Marking guide", note: "Seen only by Administrators and the subject's Head Coaches (and, later, its authorised markers)." },
];

function FilesTab({ test, canManage, onChanged }: { test: Test; canManage: boolean; onChanged: (t: Test, message: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {FILES.map((f) => <FileCard key={f.kind} test={test} spec={f} canManage={canManage} onChanged={onChanged} />)}
    </div>
  );
}

function FileCard({ test, spec, canManage, onChanged }: { test: Test; spec: (typeof FILES)[number]; canManage: boolean; onChanged: (t: Test, message: string) => void }) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const current = test.files[spec.key];
  const upload = useMutation({
    mutationFn: (file: File) => testsApi.putFile(test.id, spec.kind, file),
    onSuccess: (t) => onChanged(t, `The ${spec.label.toLowerCase()} was ${current ? "replaced" : "uploaded"}.`),
    onError: (e) => setError(errorMessage(e)),
    onSettled: () => { if (input.current) input.current.value = ""; },
  });
  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!hasAcceptedExtension(file.name, TEST_FILE_ACCEPT)) return setError("Use a PDF or an image (JPEG, PNG, WebP, GIF, HEIC).");
    if (file.size > TEST_FILE_MAX_BYTES) return setError(`The file is larger than ${formatFileSize(TEST_FILE_MAX_BYTES)}.`);
    upload.mutate(file);
  }
  return (
    <section className="rounded-xl border border-slate-200 p-4" aria-labelledby={`${ids}-h`} data-testid={`file-${spec.kind}`}>
      <h3 id={`${ids}-h`} className="text-sm font-bold text-slate-900">{spec.label}</h3>
      <p className="mb-3 mt-0.5 text-xs text-slate-600">{spec.note}</p>
      {current ? (
        <FileButton file={{ id: current.fileId, originalName: current.name, mimeType: current.mimeType, size: current.size }} fetchFile={() => testsApi.file(test.id, spec.kind)} />
      ) : (
        <p className="text-sm text-slate-700">None yet.</p>
      )}
      {current && <p className="mt-1 text-[11px] text-slate-600">Uploaded {formatDateTime(current.uploadedAt)}</p>}
      {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={`${ids}-file`} className={`${btnSecondary} cursor-pointer ${upload.isPending ? "pointer-events-none opacity-60" : ""}`}>
            {upload.isPending ? "Uploading…" : current ? "Replace" : "Upload"}
          </label>
          <input ref={input} id={`${ids}-file`} type="file" accept={TEST_FILE_ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])}
            aria-label={`${current ? "Replace" : "Upload"} the ${spec.label.toLowerCase()}`} data-testid={`upload-${spec.kind}`} />
          {current && <button type="button" className={btnDanger} onClick={() => setRemoving(true)}>Remove</button>}
        </div>
      )}
      {removing && (
        <ConfirmDialog title={`Remove the ${spec.label.toLowerCase()}?`} confirmLabel="Remove" tone="danger"
          onConfirm={async () => onChanged(await testsApi.removeFile(test.id, spec.kind), `The ${spec.label.toLowerCase()} was removed.`)} onClose={() => setRemoving(false)} />
      )}
    </section>
  );
}
