"use client";

/**
 * Review (Test Management Phase 3; tests.review — Administrators, the subject's Head Coaches): submissions by status with
 * the student (reviewers see identity), the markers and their marks; one submission opens with every marking SIDE BY
 * SIDE (first, second, adjusted: marks per question and comments), and the decisions the backend allows now:
 *   approve (locks) · return for correction (mandatory comment) · request an independent second marking (another
 *   authorised coach) · choose the first, the second or an ADJUSTED mark (mandatory reason; tests.adjustMarks — the
 *   subject's Head Coach only, G4: Administrators never edit or adjust marks) · unlock (mandatory reason).
 * Two reviewers deciding at once: the second gets a conflict (409) and sees the current state. The backend checks every
 * permission and transition; the screen only hides what the user cannot do.
 */
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { testMarkingApi, type MarkingKind, type ReviewDetail, type StaffMarking } from "@/lib/api/test-marking";
import { testTrackingApi, type SubmissionStatus } from "@/lib/api/test-submissions";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { SUBMISSION_STATUS_LABEL, newClientKey } from "@/lib/test-management/submissions";
import {
  ASSIGNMENT_METHOD_LABEL, COMMENT_MAX, KIND_LABEL, MARKING_STATUS_BADGE, REVIEW_ACTION_LABEL, REVIEW_FILTERS, TESTS_ADJUST_MARKS,
  TESTS_DISTRIBUTE, draftFrom, draftTotal, marksBody, marksProblems, marksText, reasonProblem, type MarksDraft,
} from "@/lib/test-management/marking";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { Modal, Notice, SearchInput, TableCard, TableMessage, btnDanger, btnPrimary, btnSecondary, linkBtn, td, th } from "@/app/admin/components/adminUi";
import { CoachDialog, SubmissionStatusBadge, useMarkingOverview } from "./DistributionPanel";
import { inputBad, inputCls, inputOk, labelCls } from "./shared";

export default function ReviewPanel({ testId }: { testId: string }) {
  const [status, setStatus] = useState<"" | SubmissionStatus>("MARKED");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const filters = { status: status || undefined, q: q || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.review(testId, filters), queryFn: () => testMarkingApi.list(testId, filters), placeholderData: keepPreviousData });
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="space-y-4" data-testid="review-panel">
      <div>
        <h3 className="text-base font-bold text-slate-900">Review</h3>
        <p className="mt-0.5 text-xs text-slate-700">Approve, return for correction, ask for a second marking, choose the mark, unlock. Approved results are locked.</p>
      </div>
      <FilterPills label="Status" options={REVIEW_FILTERS.map((f) => ({ ...f, count: f.value ? counts[f.value] ?? 0 : total }))} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search students or codes" label="Search submissions" />
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the submissions" onRetry={() => list.refetch()} /> : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Student</th>
                <th className={th}>Status</th>
                <th className={th}>First marking</th>
                <th className={th}>Second marking</th>
                <th className={th}>Final</th>
                <th className={th}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="review-rows">
              {list.data.data.length === 0 ? <TableMessage colSpan={6}>No submission here.</TableMessage> : list.data.data.map((r) => (
                <tr key={r.id} className="text-xs" data-testid={`review-${r.student.username}`}>
                  <td className={td}>
                    <span className="font-semibold text-gray-900">{personName(r.student)}</span>
                    <span className="block text-gray-600">{r.student.school?.name ?? "—"} · <span className="font-mono">{r.publicCode}</span></span>
                  </td>
                  <td className={td}><SubmissionStatusBadge status={r.status} /></td>
                  <td className={`${td} text-gray-800`}>{r.firstMarker ? personName(r.firstMarker) : "—"}{r.first?.totalMarks != null && <span className="block font-semibold">{r.first.totalMarks}</span>}</td>
                  <td className={`${td} text-gray-800`}>{r.secondMarker ? personName(r.secondMarker) : "—"}{r.second?.totalMarks != null && <span className="block font-semibold">{r.second.totalMarks}</span>}</td>
                  <td className={`${td} text-gray-900`}>{r.final ? <><span className="font-bold">{r.final.totalMarks}</span> <span className="text-gray-600">({KIND_LABEL[r.final.kind].toLowerCase()})</span></> : "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {r.status !== "SUBMITTED" && <button type="button" className={linkBtn} onClick={() => setOpen(r.id)} aria-label={`Review ${personName(r.student)}`} data-testid={`open-review-${r.student.username}`}>Review</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
      {open && <ReviewDialog testId={testId} submissionId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

type Decision = "approve" | "return" | "second" | "choose" | "unlock" | "reassign";

function ReviewDialog({ testId, submissionId, onClose }: { testId: string; submissionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const one = useQuery({ queryKey: queryKeys.tests.reviewDetail(testId, submissionId), queryFn: () => testMarkingApi.get(testId, submissionId) });
  const [notice, setNotice] = useState<string | null>(null);
  const done = async (d: ReviewDetail, message: string) => {
    qc.setQueryData(queryKeys.tests.reviewDetail(testId, submissionId), d);
    await qc.invalidateQueries({ queryKey: queryKeys.tests.all, predicate: (x) => x.queryKey.includes("marking") && !x.queryKey.includes("detail") });
    // Phase 4: an approval or an unlock (G6 withdrawal) changes what Publishing, Results and Rankings show.
    await qc.invalidateQueries({ queryKey: [...queryKeys.tests.all, "results", testId] });
    setNotice(message);
  };
  return (
    <Modal title="Review" onClose={onClose} wide>
      {one.isPending ? <LoadingBlock /> : one.isError ? <ErrorState error={one.error} title="Couldn't load the submission" onRetry={() => one.refetch()} /> : (
        <ReviewBody d={one.data} testId={testId} notice={notice} onNotice={setNotice} onDone={done}
          onConflict={async () => { await one.refetch(); }} />
      )}
    </Modal>
  );
}

function ReviewBody({ d, testId, notice, onNotice, onDone, onConflict }: {
  d: ReviewDetail; testId: string; notice: string | null; onNotice: (m: string | null) => void;
  onDone: (d: ReviewDetail, m: string) => Promise<void>; onConflict: () => Promise<void>;
}) {
  const { can, permissionsStatus } = useSession();
  const canChoose = actionAllowed(TESTS_ADJUST_MARKS, permissionsStatus, can);
  const canReassign = actionAllowed(TESTS_DISTRIBUTE, permissionsStatus, can);
  const [decision, setDecision] = useState<Decision | null>(null);
  const overview = useMarkingOverview(testId, decision === "second" || decision === "reassign");
  const columns = useMemo(() => {
    const current = new Set(d.assignments.filter((a) => a.current).map((a) => a.id));
    // Current first / second markings and every adjustment; a marking of an ended assignment is history only.
    return d.markings.filter((m) => m.kind === "ADJUSTMENT" || (m.assignmentId && current.has(m.assignmentId)));
  }, [d]);
  const submitted = columns.filter((m) => m.status === "SUBMITTED" || m.status === "APPROVED");
  const markers = submitted.filter((m) => m.kind !== "ADJUSTMENT");
  const a = d.actions;
  const firstCoach = d.assignments.find((x) => x.current && x.kind === "FIRST")?.coach.id;
  const secondCoach = d.assignments.find((x) => x.current && x.kind === "SECOND")?.coach.id;

  return (
    <div className="space-y-5 text-sm" data-testid="review-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{personName(d.student)} <span className="font-normal text-slate-600">@{d.student.username}</span></p>
          <p className="text-xs text-slate-700">{d.student.gradeLevel ?? "—"}{d.student.school && ` · ${d.student.school.name}`} · code <span className="font-mono">{d.publicCode}</span></p>
        </div>
        <SubmissionStatusBadge status={d.status} />
      </div>
      {notice && <Notice tone="success" onClose={() => onNotice(null)}>{notice}</Notice>}
      {d.status === "APPROVED" && <Alert tone="info">Approved and locked. Unlock it (with a reason) to change anything.</Alert>}
      {d.status === "PUBLISHED" && (
        <Alert tone="info">
          Published: the student and their school&apos;s teachers can see this result. Unlocking it (with a reason) withdraws it from their views until it is
          approved and published again; they are told once.
        </Alert>
      )}

      <section aria-label="Marks side by side">
        <h4 className="mb-2 text-sm font-bold text-slate-900">Marks</h4>
        {columns.length === 0 ? <p className="text-slate-700">Not marked yet.</p> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-xs" data-testid="side-by-side">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold text-slate-700">Question</th>
                  {columns.map((m) => (
                    <th key={m.id} scope="col" className={`px-3 py-2 text-left font-semibold ${m.final ? "bg-emerald-50 text-emerald-900" : "text-slate-700"}`} data-testid={`column-${m.kind}`}>
                      {KIND_LABEL[m.kind]}{m.final && " (final)"}
                      <span className="block font-normal text-slate-600">{personName(m.marker)}</span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${MARKING_STATUS_BADGE[m.status].className}`}>{MARKING_STATUS_BADGE[m.status].label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.test.questions.map((q) => (
                  <tr key={q.id}>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-slate-800">Q{q.order} <span className="text-slate-600">(/{q.maxMarks})</span></th>
                    {columns.map((m) => {
                      const s = m.scores.find((x) => x.questionId === q.id);
                      return <td key={m.id} className="px-3 py-2 text-slate-900">{s?.marks ?? "—"}{s?.comment && <span className="block text-slate-600">“{s.comment}”</span>}</td>;
                    })}
                  </tr>
                ))}
                <tr className="bg-slate-50 font-bold">
                  <th scope="row" className="px-3 py-2 text-left text-slate-900">Total (/{d.test.maxMarks})</th>
                  {columns.map((m) => <td key={m.id} className="px-3 py-2 text-slate-900" data-testid={`total-${m.kind}`}>{m.status === "DRAFT" ? "draft" : m.totalMarks ?? "—"}</td>)}
                </tr>
                {columns.some((m) => m.comment) && (
                  <tr>
                    <th scope="row" className="px-3 py-2 text-left font-normal text-slate-800">Comment</th>
                    {columns.map((m) => <td key={m.id} className="px-3 py-2 text-slate-800">{m.comment ?? "—"}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2" data-testid="review-actions">
        {a.approve && <button type="button" className={btnPrimary} onClick={() => setDecision("approve")} data-testid="action-approve">Approve</button>}
        {a.return && <button type="button" className={btnSecondary} onClick={() => setDecision("return")} data-testid="action-return">Return for correction</button>}
        {a.requestSecondMarking && <button type="button" className={btnSecondary} onClick={() => setDecision("second")} data-testid="action-second">Request second marking</button>}
        {a.choose && canChoose && <button type="button" className={btnSecondary} onClick={() => setDecision("choose")} data-testid="action-choose">Choose or adjust the mark</button>}
        {a.unlock && <button type="button" className={btnDanger} onClick={() => setDecision("unlock")} data-testid="action-unlock">Unlock</button>}
        {(a.reassignFirst || a.reassignSecond) && canReassign && <button type="button" className={btnSecondary} onClick={() => setDecision("reassign")}>Reassign</button>}
      </div>

      {d.answer && (
        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold text-slate-900">Answer (version {d.answer.version} of {d.answer.versionCount})</summary>
          {d.answer.typedAnswer && <p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-900">{d.answer.typedAnswer}</p>}
          {d.answer.pages.length > 0 && (
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {d.answer.pages.map((p) => (
                <li key={p.page}><FileButton file={{ id: `${d.answer!.versionId}-${p.page}`, originalName: p.name, mimeType: p.mimeType, size: p.size }}
                  fetchFile={() => testTrackingApi.page(testId, d.id, d.answer!.versionId, p.page)} /></li>
              ))}
            </ul>
          )}
        </details>
      )}

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer font-semibold text-slate-900">Markers, decisions and history</summary>
        <div className="mt-2 space-y-3 text-xs text-slate-800">
          <List title="Markers">
            {d.assignments.map((x) => (
              <li key={x.id}>{KIND_LABEL[x.kind]}: {personName(x.coach)} · {ASSIGNMENT_METHOD_LABEL[x.method]} {formatDateTime(x.assignedAt)}{x.assignedBy && ` by ${personName(x.assignedBy)}`}
                {x.reason && ` (“${x.reason}”)`}{x.endedAt && ` · ended ${formatDateTime(x.endedAt)}${x.endedBy ? ` by ${personName(x.endedBy)}` : ""}: “${x.endReason}”`}</li>
            ))}
          </List>
          <List title="Decisions">
            {d.reviews.length === 0 ? <li>None yet.</li> : d.reviews.map((r) => (
              <li key={r.id}>{formatDateTime(r.createdAt)} · {REVIEW_ACTION_LABEL[r.action]}{r.chosenKind && ` (${KIND_LABEL[r.chosenKind].toLowerCase()})`}{r.actor && ` · ${personName(r.actor)}`}{r.comment && `: “${r.comment}”`}</li>
            ))}
          </List>
          <List title="Mark changes">
            {d.markChanges.length === 0 ? <li>None yet.</li> : d.markChanges.map((c) => {
              const m = d.markings.find((x) => x.id === c.markingId);
              const q = d.test.questions.find((x) => x.id === c.questionId);
              return <li key={c.id}>{formatDateTime(c.createdAt)} · {m ? KIND_LABEL[m.kind] : "Marking"} · {q ? `Q${q.order}` : "total"}: {c.oldMarks ?? "—"} → {c.newMarks ?? "—"}{c.changedBy && ` · ${personName(c.changedBy)}`}{c.reason && `: “${c.reason}”`}</li>;
            })}
          </List>
          <List title="Status history">
            {d.statusHistory.map((h, i) => (
              <li key={i}>{formatDateTime(h.createdAt)} · {h.fromStatus ? `${SUBMISSION_STATUS_LABEL[h.fromStatus]} → ` : ""}{SUBMISSION_STATUS_LABEL[h.toStatus]}{h.actor && ` · ${personName(h.actor)}`}{h.reason && `: “${h.reason}”`}</li>
            ))}
          </List>
        </div>
      </details>

      {decision && decision !== "reassign" && decision !== "second" && (
        <DecisionDialog d={d} testId={testId} decision={decision} markers={markers} submitted={submitted}
          onClose={() => setDecision(null)} onDone={onDone} onConflict={onConflict} />
      )}
      {decision === "second" && overview.data && (
        <CoachDialog o={overview.data} title="Request a second marking" confirmLabel="Request" reasonRequired={false}
          exclude={[firstCoach, secondCoach].filter((x): x is string => !!x)}
          onSubmit={async (coachId, reason) => {
            await run(onConflict, async () => onDone(await testMarkingApi.requestSecondMarking(testId, d.id, { coachId, ...(reason && { reason }), clientKey: newClientKey(), expectedStatus: d.status }),
              "A second coach marks it independently; they cannot see the first marks."));
          }}
          onClose={() => setDecision(null)} />
      )}
      {decision === "reassign" && overview.data && (
        <CoachDialog o={overview.data} title="Reassign" confirmLabel="Reassign" reasonRequired
          kinds={a.reassignFirst && a.reassignSecond ? ["FIRST", "SECOND"] : a.reassignSecond ? ["SECOND"] : ["FIRST"]}
          exclude={[firstCoach, secondCoach].filter((x): x is string => !!x)}
          onSubmit={async (coachId, reason, kind) => {
            await run(onConflict, async () => onDone(await testMarkingApi.reassign(testId, d.id, { coachId, reason, kind }), "Reassigned."));
          }}
          onClose={() => setDecision(null)} />
      )}
    </div>
  );
}

function List({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wider text-slate-600">{title}</p>
      <ul className="mt-1 space-y-0.5">{children}</ul>
    </div>
  );
}

/** A 409 (someone else decided meanwhile): reload the submission, then show the error. */
async function run(onConflict: () => Promise<void>, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (isApiError(e) && e.status === 409) await onConflict();
    throw e;
  }
}

function DecisionDialog({ d, testId, decision, markers, submitted, onClose, onDone, onConflict }: {
  d: ReviewDetail; testId: string; decision: Exclude<Decision, "reassign" | "second">; markers: StaffMarking[]; submitted: StaffMarking[];
  onClose: () => void; onDone: (d: ReviewDetail, m: string) => Promise<void>; onConflict: () => Promise<void>;
}) {
  const ids = useId();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"FIRST" | "SECOND">(markers[0]?.kind === "SECOND" ? "SECOND" : "FIRST");
  const [source, setSource] = useState<MarkingKind>(submitted.some((m) => m.kind === "SECOND") ? "SECOND" : "FIRST");
  // Adjusted marks start from the marks they replace: the final ones, else the latest independent marking (as the backend logs it).
  const base = submitted.find((m) => m.final) ?? submitted.find((m) => m.kind === "SECOND") ?? submitted.find((m) => m.kind === "FIRST") ?? null;
  const [marks, setMarks] = useState<MarksDraft>(() => draftFrom(d.test.questions, base));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => newClientKey());
  const twoMarkings = markers.length > 1;
  const choiceNeeded = decision === "approve" && submitted.some((m) => m.kind === "SECOND") && !d.finalMarkingId;
  const spec = {
    approve: { title: "Approve this result?", label: "Approve", text: null as null | { label: string; max: number } },
    return: { title: "Return for correction", label: "Return", text: { label: "Comment for the marker", max: COMMENT_MAX } },
    choose: { title: "Choose the mark that counts", label: "Confirm", text: { label: "Reason", max: 500 } },
    unlock: {
      title: d.status === "PUBLISHED" ? "Unlock and withdraw this published result?" : "Unlock this approved result?",
      label: d.status === "PUBLISHED" ? "Unlock and withdraw" : "Unlock", text: { label: "Reason", max: 500 },
    },
  }[decision];

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (spec.text) {
      const rp = reasonProblem(text, spec.text.max);
      if (rp) p.text = rp;
    }
    if (decision === "choose" && source === "ADJUSTMENT") Object.assign(p, marksProblems(d.test.questions, d.test.maxMarks, marks, true));
    setErrors(p);
    if (Object.keys(p).length) return;
    setBusy(true);
    setError(null);
    const common = { clientKey: key, expectedStatus: d.status };
    try {
      await run(onConflict, async () => {
        if (decision === "approve") await onDone(await testMarkingApi.approve(testId, d.id, common), "Approved: the result is locked.");
        else if (decision === "return") await onDone(await testMarkingApi.returnForCorrection(testId, d.id, { ...common, comment: text.trim(), ...(twoMarkings && { kind }) }), "Returned to the marker for correction.");
        else if (decision === "unlock") await onDone(await testMarkingApi.unlock(testId, d.id, { ...common, reason: text.trim() }),
          d.status === "PUBLISHED" ? "Unlocked and withdrawn: the student and their teachers no longer see it until it is published again." : "Unlocked: it can be reviewed again.");
        else await onDone(await testMarkingApi.choose(testId, d.id, {
          ...common, source, reason: text.trim(), ...(source === "ADJUSTMENT" && { marks: marksBody(d.test.questions, marks) }),
        }), source === "ADJUSTMENT" ? "Adjusted marks recorded as the final mark." : `The ${source === "FIRST" ? "first" : "second"} marking is the final mark.`);
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={spec.title} onClose={busy ? () => undefined : onClose} wide={decision === "choose"}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid={`decision-${decision}`}>
        {error && <Alert tone="error">{error}</Alert>}
        {decision === "approve" && (choiceNeeded
          ? <Alert tone="error">Two markings exist: the subject&apos;s Head Coach chooses the mark first.</Alert>
          : <p className="text-slate-700">The final mark becomes approved and locked.</p>)}
        {decision === "return" && twoMarkings && (
          <fieldset>
            <legend className={labelCls}>Which marking</legend>
            {markers.map((m) => (
              <label key={m.id} className="mr-4 inline-flex items-center gap-2 text-sm text-slate-900">
                <input type="radio" name={`${ids}-kind`} checked={kind === m.kind} onChange={() => setKind(m.kind as "FIRST" | "SECOND")} /> {KIND_LABEL[m.kind]} ({personName(m.marker)})
              </label>
            ))}
          </fieldset>
        )}
        {decision === "choose" && (
          <fieldset>
            <legend className={labelCls}>The mark that counts</legend>
            <div className="flex flex-wrap gap-3">
              {submitted.filter((m) => m.kind !== "ADJUSTMENT").map((m) => (
                <label key={m.id} className="inline-flex items-center gap-2 text-sm text-slate-900">
                  <input type="radio" name={`${ids}-source`} checked={source === m.kind} onChange={() => setSource(m.kind)} data-testid={`choose-${m.kind}`} />
                  {KIND_LABEL[m.kind]} — {marksText(m.totalMarks, d.test.maxMarks)}
                </label>
              ))}
              <label className="inline-flex items-center gap-2 text-sm text-slate-900">
                <input type="radio" name={`${ids}-source`} checked={source === "ADJUSTMENT"} onChange={() => setSource("ADJUSTMENT")} data-testid="choose-ADJUSTMENT" /> Adjusted marks
              </label>
            </div>
          </fieldset>
        )}
        {decision === "choose" && source === "ADJUSTMENT" && (
          <AdjustFields d={d} marks={marks} setMarks={setMarks} errors={errors} />
        )}
        {spec.text && (
          <div>
            <label htmlFor={`${ids}-text`} className={labelCls}>{spec.text.label} <span className="text-red-700">*</span></label>
            <textarea id={`${ids}-text`} rows={3} maxLength={spec.text.max} className={`${inputCls} ${errors.text ? inputBad : inputOk}`} value={text}
              onChange={(e) => setText(e.target.value)} aria-invalid={!!errors.text} aria-describedby={errors.text ? `${ids}-text-e` : undefined} data-testid="decision-text" />
            {errors.text && <p id={`${ids}-text-e`} className="mt-1 text-xs text-red-700">{errors.text}</p>}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={decision === "unlock" ? btnDanger : btnPrimary} disabled={busy || choiceNeeded} data-testid="decision-confirm">
            {busy ? "Saving…" : spec.label}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The adjusted marks (the subject's Head Coach only — G4), starting from the marks they replace. */
function AdjustFields({ d, marks, setMarks, errors }: { d: ReviewDetail; marks: MarksDraft; setMarks: (f: (m: MarksDraft) => MarksDraft) => void; errors: Record<string, string> }) {
  const ids = useId();
  const total = draftTotal(d.test.questions, marks);
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3" data-testid="adjust-fields">
      {d.test.questions.length === 0 ? (
        <div className="max-w-[12rem]">
          <label htmlFor={`${ids}-total`} className={labelCls}>Total (of {d.test.maxMarks})</label>
          <input id={`${ids}-total`} inputMode="numeric" className={`${inputCls} ${errors.total ? inputBad : inputOk}`} value={marks.total}
            onChange={(e) => setMarks((m) => ({ ...m, total: e.target.value }))} aria-invalid={!!errors.total} />
          {errors.total && <p className="mt-1 text-xs text-red-700">{errors.total}</p>}
        </div>
      ) : d.test.questions.map((q) => {
        const k = `q:${q.id}`;
        const v = marks.scores[q.id] ?? { marks: "", comment: "" };
        return (
          <div key={q.id} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${ids}-${q.id}`} className="w-40 text-sm text-slate-800">Question {q.order} (of {q.maxMarks})</label>
            <input id={`${ids}-${q.id}`} inputMode="numeric" className={`${inputCls} ${errors[k] ? inputBad : inputOk} max-w-[7rem]`} value={v.marks}
              onChange={(e) => setMarks((m) => ({ ...m, scores: { ...m.scores, [q.id]: { ...v, marks: e.target.value } } }))}
              aria-invalid={!!errors[k]} data-testid={`adjust-q${q.order}`} />
            {errors[k] && <span className="text-xs text-red-700">{errors[k]}</span>}
          </div>
        );
      })}
      <p className="text-sm font-semibold text-slate-900">Adjusted total: {marksText(total, d.test.maxMarks)}</p>
    </div>
  );
}
