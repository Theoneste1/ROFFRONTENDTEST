"use client";

/**
 * "Reassign submission" (owner 2026-11-28; tests.reassignSubmission: Administrators and Super Administrators): correct a
 * student's submitted answer made under the wrong programme (subject) or level. Two steps — Choose (programme, level,
 * test, reason), then Review (current vs new). The SAME submission moves; nothing is copied or deleted. Once marking has
 * started only the level can change within the same test. Rules: lib/test-management/reassignment.ts; the backend
 * refuses every move this would not offer.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { submissionReassignmentApi, type ReassignOptions, type ReassignResult } from "@/lib/api/test-submissions";
import { queryKeys } from "@/lib/query/keys";
import { formatDate, formatDateTime, personName } from "@/lib/format";
import { SUBMISSION_STATUS_LABEL } from "@/lib/test-management/submissions";
import {
  REASSIGN_PROBLEM_LABEL, REASSIGN_REASON_MAX, answerSummary, destinationsFor, keptParts, pickDestination, reassignChanges,
  reassignChoiceProblems, subjectsOf, type ReassignChoice, type ReassignProblems,
} from "@/lib/test-management/reassignment";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Modal } from "@/app/admin/components/adminUi";

/** Brand buttons (the logo blue), full width on phones. */
export const reassignPrimary =
  "inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
export const reassignSecondary =
  "inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const fieldCls =
  "w-full min-h-10 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-100 disabled:text-slate-600";
const labelCls = "mb-1 block text-xs font-semibold text-slate-800";

export default function ReassignDialog({ testId, submissionId, onClose, onDone }: {
  testId: string;
  submissionId: string;
  onClose: () => void;
  onDone: (result: ReassignResult) => void;
}) {
  const options = useQuery({
    queryKey: queryKeys.tests.reassignment(testId, submissionId),
    queryFn: () => submissionReassignmentApi.options(testId, submissionId),
    staleTime: 0,
  });
  return (
    <Modal title="Reassign submission" onClose={onClose} wide>
      <div data-testid="reassign-dialog">
        {options.isPending ? <LoadingBlock /> : options.isError ? (
          <ErrorState error={options.error} title="Couldn't load this submission's details" onRetry={() => options.refetch()} />
        ) : (
          <Steps o={options.data} testId={testId} onClose={onClose} onDone={onDone} />
        )}
      </div>
    </Modal>
  );
}

function Steps({ o, testId, onClose, onDone }: { o: ReassignOptions; testId: string; onClose: () => void; onDone: (r: ReassignResult) => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [choice, setChoice] = useState<ReassignChoice>({
    subjectId: o.current.subject.id,
    level: o.current.level ?? o.levels[0]?.code ?? "",
    testId: o.current.test.id,
    reason: "",
  });
  const [problems, setProblems] = useState<ReassignProblems>({});
  const move = useMutation({
    mutationFn: () => submissionReassignmentApi.reassign(testId, o.submission.id, {
      testId: choice.testId, level: choice.level, reason: choice.reason.trim(), expectedTestId: o.current.test.id,
    }),
    onSuccess: onDone,
  });

  const levelName = (code: string | null | undefined) =>
    code === "ALL" ? "every level" : (o.levels.find((l) => l.code === code)?.name ?? code ?? "—");
  const testLabel = (t: { title: string; division: string }) => `${t.title} (${levelName(t.division)})`;
  const subjects = subjectsOf(o);
  // Marking started: the answer stays under its test (only the level can change), so the current test is the only one.
  const offered = o.markingStarted
    ? o.destinations.filter((d) => d.id === o.current.test.id)
    : destinationsFor(o.destinations, choice.subjectId, choice.level);

  // Changing the programme or the level keeps the chosen test when it still fits, else picks the first that can take it.
  const change = (next: Partial<ReassignChoice>) => {
    const c = { ...choice, ...next };
    if (!o.markingStarted && (next.subjectId !== undefined || next.level !== undefined)) {
      c.testId = pickDestination(destinationsFor(o.destinations, c.subjectId, c.level), c.testId);
    }
    setChoice(c);
    if (Object.keys(problems).length) setProblems({});
  };

  function review() {
    const p = reassignChoiceProblems(o, choice);
    setProblems(p);
    if (!p.test && !p.level && !p.reason) setStep(2);
  }

  const s = o.submission;
  const dest = o.destinations.find((d) => d.id === choice.testId);

  return (
    <div className="space-y-5 text-sm">
      <p className="flex items-center gap-2 text-xs font-semibold" aria-label={`Step ${step} of 2`}>
        <span className={step === 1 ? "text-brand" : "text-slate-600"} aria-current={step === 1 ? "step" : undefined}>1 Choose</span>
        <span className="text-slate-500" aria-hidden="true">›</span>
        <span className={step === 2 ? "text-brand" : "text-slate-600"} aria-current={step === 2 ? "step" : undefined}>2 Review</span>
      </p>

      {step === 1 ? (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[8rem_1fr]" data-testid="reassign-facts">
            <Fact label="Student"><span className="font-semibold">{personName(s.student)}</span> <span className="font-mono text-xs text-slate-600">{s.student.username}</span></Fact>
            <Fact label="Paper">
              <span className="font-mono text-xs">{s.publicCode}</span> · submitted {formatDateTime(s.lastSubmittedAt ?? s.firstSubmittedAt)} · {answerSummary(s.answer)}
            </Fact>
            <Fact label="Test now">{testLabel(o.current.test)}</Fact>
            <Fact label="Now">
              {o.current.subject.name} · {levelName(o.current.level)}
              {o.markingStarted && <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{SUBMISSION_STATUS_LABEL[s.status] ?? s.status}</span>}
            </Fact>
          </dl>

          {o.markingStarted && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="note" data-testid="reassign-marking-note">
              <p className="font-semibold">Marking has started under this test.</p>
              <p className="mt-1">{o.markingStartedMessage}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reassign-subject" className={labelCls}>New programme / subject</label>
              <select id="reassign-subject" className={`${fieldCls} border-slate-300`} value={choice.subjectId} disabled={o.markingStarted}
                onChange={(e) => change({ subjectId: e.target.value })} data-testid="reassign-subject">
                {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}{o.markingStarted ? " (cannot change)" : ""}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="reassign-level" className={labelCls}>New level</label>
              <select id="reassign-level" className={`${fieldCls} ${problems.level ? "border-red-500" : "border-slate-300"}`} value={choice.level}
                onChange={(e) => change({ level: e.target.value })} data-testid="reassign-level"
                aria-invalid={problems.level ? true : undefined} aria-describedby={problems.level ? "reassign-level-error" : undefined}>
                {!choice.level && <option value="">Choose a level</option>}
                {o.levels.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
              {problems.level && <p id="reassign-level-error" className="mt-1 text-xs text-red-700">{problems.level}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="reassign-test" className={labelCls}>New test</label>
            <select id="reassign-test" className={`${fieldCls} ${problems.test ? "border-red-500" : "border-slate-300"}`} value={choice.testId}
              disabled={o.markingStarted} onChange={(e) => change({ testId: e.target.value })} data-testid="reassign-test"
              aria-invalid={problems.test ? true : undefined} aria-describedby={problems.test ? "reassign-test-error" : "reassign-test-hint"}>
              {(!choice.testId || offered.length === 0) && <option value="">{offered.length === 0 ? "No published test of this programme for this level" : "Choose a test"}</option>}
              {offered.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.available}>
                  {testLabel(d)}
                  {d.problem === "SAME_TEST" ? " — current test" : d.problem ? ` — ${REASSIGN_PROBLEM_LABEL[d.problem]}` : ` · closes ${formatDate(d.closesAt)}`}
                </option>
              ))}
            </select>
            {problems.test ? (
              <p id="reassign-test-error" className="mt-1 text-xs text-red-700" data-testid="reassign-test-error">{problems.test}</p>
            ) : (
              <p id="reassign-test-hint" className="mt-1 text-xs text-slate-600">
                Only published tests of the chosen programme, for every level or the chosen level, are offered. A test for every level keeps the same test and changes the level only.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reassign-reason" className={labelCls}>Reason for the correction (required)</label>
            <textarea id="reassign-reason" rows={3} maxLength={REASSIGN_REASON_MAX} value={choice.reason}
              onChange={(e) => change({ reason: e.target.value })}
              className={`${fieldCls} ${problems.reason ? "border-red-500" : "border-slate-300"}`}
              placeholder="For example: the student is in S5 and chose the Junior test by mistake."
              aria-invalid={problems.reason ? true : undefined} aria-describedby={problems.reason ? "reassign-reason-error" : undefined} data-testid="reassign-reason" />
            {problems.reason && <p id="reassign-reason-error" className="mt-1 text-xs text-red-700" data-testid="reassign-reason-error">{problems.reason}</p>}
          </div>

          <Note>The same submission moves: uploaded pages, typed answer, submission time, status and history are kept. Nothing is copied or deleted.</Note>

          <Buttons>
            <button type="button" className={reassignSecondary} onClick={onClose}>Cancel</button>
            <button type="button" className={reassignPrimary} onClick={review} data-testid="reassign-review">Review change</button>
          </Buttons>
        </>
      ) : (
        <Review o={o} choice={choice} levelName={levelName} destTitle={dest ? testLabel(dest) : ""} destSubject={dest?.subject.name ?? ""}
          error={move.error ? errorMessage(move.error) : null} pending={move.isPending}
          onBack={() => { move.reset(); setStep(1); }} onConfirm={() => move.mutate()} />
      )}
    </div>
  );
}

function Review({ o, choice, levelName, destTitle, destSubject, error, pending, onBack, onConfirm }: {
  o: ReassignOptions;
  choice: ReassignChoice;
  levelName: (code: string | null | undefined) => string;
  destTitle: string;
  destSubject: string;
  error: string | null;
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const s = o.submission;
  const changed = reassignChanges(o, choice);
  const kept = [...keptParts(s.answer), `submitted ${formatDateTime(s.lastSubmittedAt ?? s.firstSubmittedAt)}`, `status “${SUBMISSION_STATUS_LABEL[s.status] ?? s.status}”`, "the status history"];
  const hi = (on: boolean) => (on ? "font-bold text-brand" : "text-slate-900");
  return (
    <>
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[8rem_1fr]">
        <Fact label="Student">
          <span className="font-semibold">{personName(s.student)}</span> <span className="font-mono text-xs text-slate-600">{s.student.username} · {s.publicCode}</span>
        </Fact>
      </dl>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 p-4" data-testid="reassign-current" aria-label="Current">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">Current</p>
          <Row label="Test">{`${o.current.test.title} (${levelName(o.current.test.division)})`}</Row>
          <Row label="Programme">{o.current.subject.name}</Row>
          <Row label="Level">{levelName(o.current.level)}</Row>
        </section>
        <section className="rounded-xl border border-brand bg-brand-light p-4" data-testid="reassign-new" aria-label="New">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand">New</p>
          <Row label="Test"><span className={hi(changed.test)} data-changed={changed.test || undefined}>{destTitle}</span></Row>
          <Row label="Programme"><span className={hi(changed.subject)} data-changed={changed.subject || undefined}>{destSubject}</span></Row>
          <Row label="Level"><span className={hi(changed.level)} data-changed={changed.level || undefined}>{levelName(choice.level)}</span></Row>
        </section>
      </div>
      <section className="rounded-xl border border-slate-200 p-4" aria-label="Reason">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-600">Reason</p>
        <p className="whitespace-pre-wrap break-words text-slate-900" data-testid="reassign-review-reason">{choice.reason.trim()}</p>
      </section>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="reassign-kept">
        Kept exactly as they are: {kept.join(", ")}.{" "}
        {o.markingStarted ? "The marks stay with this test." : "No marking has started."}
      </div>
      <Note>Recorded in the audit log: you, the time, the values before and after, and this reason.</Note>
      {error && <Alert tone="error"><span data-testid="reassign-error">{error}</span></Alert>}
      <Buttons>
        <button type="button" className={reassignSecondary} onClick={onBack} disabled={pending}>Back</button>
        <button type="button" className={reassignPrimary} onClick={onConfirm} disabled={pending} data-testid="reassign-confirm">
          {pending ? "Moving…" : "Confirm reassignment"}
        </button>
      </Buttons>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-1 text-xs text-slate-600 sm:text-sm">{label}</dt>
      <dd className="break-words pb-1 text-slate-900 sm:pt-1">{children}</dd>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="grid grid-cols-[5.5rem_1fr] gap-2 py-0.5">
      <span className="text-slate-600">{label}</span>
      <span className="break-words">{children}</span>
    </p>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

/** Cancel / Back, then the main action: side by side on wide screens, stacked (main action first) on phones. */
function Buttons({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">{children}</div>;
}
