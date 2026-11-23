"use client";

/**
 * Submissions tab of a test (tests.viewSubmissions: Administrators; Head Coaches of the subject). Tracking: every
 * eligible student — submitted / not yet / late (blocked) / under extension — with counts, filters (state, school,
 * division, name) and pagination; one submission opens with EVERY version (submitter, teacher, time, the deadline that
 * applied, the under-extension mark, pages) and its status history. "Extended" is shown here only (never to markers).
 */
import { useTestLevelOptions } from "@/lib/queries/divisions";
import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Unlock } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/api/errors";
import { testTrackingApi, type StaffSubmissionDetail, type TrackingFilter } from "@/lib/api/test-submissions";
import { schoolsApi } from "@/lib/api/admin";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { EXTENSION_KIND_LABEL, SUBMISSION_STATUS_LABEL, SUBMITTER_LABEL, TESTS_AUTHORIZE_RESUBMISSION, TRACKING_BADGE, TRACKING_FILTERS, resubmissionReasonProblem } from "@/lib/test-management/submissions";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { MetricCard, Modal, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "@/app/admin/components/adminUi";
import StudentName from "@/app/components/students/StudentName";

export function ExtendedBadge({ label = "Extended" }: { label?: string }) {
  return <span className="inline-flex rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-900" data-testid="extended-badge">{label}</span>;
}

export default function SubmissionsPanel({ testId }: { testId: string }) {
  const [status, setStatus] = useState<"" | TrackingFilter>("");
  const [division, setDivision] = useState("");
  const levelOptions = useTestLevelOptions().filter((o) => o.value !== "ALL");
  const [schoolId, setSchoolId] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const filters = { status: status || undefined, division: division || undefined, schoolId: schoolId || undefined, q: q || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.tracking(testId, filters), queryFn: () => testTrackingApi.list(testId, filters), placeholderData: keepPreviousData });
  // Schools for the filter (Administrators); a Head Coach without the school list simply has no school filter.
  const schools = useQuery({ queryKey: ["schools", "options"], queryFn: () => schoolsApi.list({ limit: 100 }), staleTime: 300_000, retry: false });
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const c = list.data?.counts;

  return (
    <div className="space-y-5" data-testid="submissions-panel">
      {list.data && (
        <p className="text-sm text-slate-800">
          Deadline {formatDateTime(list.data.deadline.closesAt)}
          {list.data.deadline.extended && <> · whole test extended to <span className="font-semibold">{formatDateTime(list.data.deadline.general)}</span> <ExtendedBadge /></>}
        </p>
      )}
      {c && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="tracking-counts">
          <MetricCard label="Students" value={c.students} />
          <MetricCard label="Submitted" value={c.submitted} subtext={`${c.submittedByTeacher} by a teacher`} />
          <MetricCard label="Not yet" value={c.notSubmitted} />
          <MetricCard label="Late (blocked)" value={c.lateBlocked} subtext={`${c.underExtension} under extension · ${c.submittedUnderExtension} submitted under one`} />
        </div>
      )}
      <FilterPills label="State" options={[...TRACKING_FILTERS]} value={status} onChange={reset(setStatus)} />
      <div className="flex flex-wrap items-end gap-3">
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Search students" label="Search students" />
        <SelectFilter label="Level" value={division} onChange={(v) => reset(setDivision)(v)}
          options={[{ label: "All levels", value: "" }, ...levelOptions]} />
        {schools.data && (
          <SelectFilter label="School" value={schoolId} onChange={reset(setSchoolId)}
            options={[{ label: "All schools", value: "" }, ...schools.data.data.map((s) => ({ label: s.name, value: s.id }))]} />
        )}
      </div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the submissions" onRetry={() => list.refetch()} /> : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Student</th>
                <th className={th}>State</th>
                <th className={th}>Deadline</th>
                <th className={th}>Latest version</th>
                <th className={th}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="tracking-rows">
              {list.data.data.length === 0 ? <TableMessage colSpan={5}>No student matches.</TableMessage> : list.data.data.map((r) => {
                const b = TRACKING_BADGE[r.state];
                const cur = r.submission?.current;
                return (
                  <tr key={r.student.id} className="text-xs" data-testid={`tracking-${r.student.username}`}>
                    <td className={td}>
                      <span className="font-semibold text-gray-900"><StudentName student={r.student} /></span> <span className="text-gray-600">@{r.student.username}</span>
                      <span className="block text-gray-700">{r.student.gradeLevel ?? "—"}{r.student.school && ` · ${r.student.school.name}`}</span>
                    </td>
                    <td className={td}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${b.className}`}>{b.label}</span>
                      {r.extended && <span className="ml-1"><ExtendedBadge label={`Extended (${EXTENSION_KIND_LABEL[r.extensionKind ?? "STUDENT"].toLowerCase()})`} /></span>}
                      {r.submission?.locked && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800" data-testid="locked-badge"><Lock className="h-3 w-3" aria-hidden="true" /> Locked</span>}
                      {r.submission?.resubmissionOpen && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900" data-testid="resubmission-badge"><Unlock className="h-3 w-3" aria-hidden="true" /> Resubmission allowed</span>}
                    </td>
                    <td className={`${td} text-gray-800`}>{formatDateTime(r.deadline)}</td>
                    <td className={`${td} text-gray-800`}>
                      {cur ? (
                        <>
                          v{cur.number} · {formatDateTime(cur.submittedAt)}
                          <span className="block text-gray-700">by {personName(cur.submittedBy)} ({SUBMITTER_LABEL[cur.submitterRole].toLowerCase()}){cur.underExtension && " · under extension"}</span>
                          <span className="block font-mono text-gray-600">{r.submission!.publicCode}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {r.submission && <button type="button" className={linkBtn} onClick={() => setOpen(r.submission!.id)} aria-label={`Versions of ${personName(r.student)}`}>Versions ({r.submission.versionCount})</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
      {open && <SubmissionDialog testId={testId} submissionId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SubmissionDialog({ testId, submissionId, onClose }: { testId: string; submissionId: string; onClose: () => void }) {
  const one = useQuery({ queryKey: queryKeys.tests.submission(testId, submissionId), queryFn: () => testTrackingApi.get(testId, submissionId) });
  return (
    <Modal title="Submission" onClose={onClose} wide>
      {one.isPending ? <LoadingBlock /> : one.isError ? <ErrorState error={one.error} title="Couldn't load the submission" onRetry={() => one.refetch()} /> : <Detail s={one.data} testId={testId} />}
    </Modal>
  );
}

function Detail({ s, testId }: { s: StaffSubmissionDetail; testId: string }) {
  return (
    <div className="space-y-4 text-sm" data-testid="submission-detail">
      <div>
        <p className="font-semibold text-slate-900">{personName(s.student)} <span className="font-normal text-slate-600">@{s.student.username}</span></p>
        <p className="text-xs text-slate-700">{s.student.gradeLevel ?? "—"}{s.student.school && ` · ${s.student.school.name}`} · code <span className="font-mono">{s.publicCode}</span></p>
        <p className="mt-1 text-xs text-slate-700">
          {SUBMISSION_STATUS_LABEL[s.status]} · deadline {formatDateTime(s.deadline)} {s.extended && <ExtendedBadge label={`Extended (${EXTENSION_KIND_LABEL[s.extensionKind ?? "STUDENT"].toLowerCase()})`} />}
        </p>
      </div>
      {s.resubmissions && <Resubmission s={s} testId={testId} />}
      <ol className="space-y-3">
        {s.versions.map((v) => (
          <li key={v.id} className="rounded-xl border border-slate-200 p-3" data-testid={`staff-version-${v.number}`}>
            <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
              Version {v.number}
              {s.current?.number === v.number && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-900">Current</span>}
              {v.underExtension && <ExtendedBadge label="Under extension" />}
            </p>
            <p className="text-xs text-slate-700">
              {formatDateTime(v.submittedAt)} · by {personName(v.submittedBy)} @{v.submittedBy.username} ({SUBMITTER_LABEL[v.submitterRole].toLowerCase()})
              {v.teacher && ` · teacher ${personName(v.teacher)}`} · deadline then {formatDateTime(v.applicableDeadline)}
            </p>
            {v.typedAnswer && <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-slate-900">{v.typedAnswer}</p>}
            {v.pages.length > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {v.pages.map((p) => (
                  <li key={p.page}><FileButton file={{ id: `${v.id}-${p.page}`, originalName: p.name, mimeType: p.mimeType, size: p.size }} fetchFile={() => testTrackingApi.page(testId, s.id, v.id, p.page)} /></li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Status history</p>
        <ul className="mt-1 text-xs text-slate-800">
          {s.statusHistory.map((h, i) => (
            <li key={i}>{formatDateTime(h.createdAt)} · {h.fromStatus ? `${SUBMISSION_STATUS_LABEL[h.fromStatus]} → ` : ""}{SUBMISSION_STATUS_LABEL[h.toStatus]}{h.actor && ` · ${personName(h.actor)}`}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Locked answers (owner 2026-11-21, testSubmissionLock): the lock state, one button for an Administrator to allow one
 * more version (with a reason) or to withdraw it, and the history of every authorization.
 */
function Resubmission({ s, testId }: { s: StaffSubmissionDetail; testId: string }) {
  const qc = useQueryClient();
  const may = useSession().permissions.has(TESTS_AUTHORIZE_RESUBMISSION);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const done = (next: StaffSubmissionDetail) => {
    qc.setQueryData(queryKeys.tests.submission(testId, s.id), next);
    void qc.invalidateQueries({ queryKey: queryKeys.tests.all });
    setAsking(false);
    setReason("");
  };
  const allow = useMutation({ mutationFn: () => testTrackingApi.authorizeResubmission(testId, s.id, reason.trim()), onSuccess: done });
  const withdraw = useMutation({ mutationFn: () => testTrackingApi.cancelResubmission(testId, s.id), onSuccess: done });
  const inMarking = s.status !== "SUBMITTED";
  const history = s.resubmissions ?? [];

  function submit(e: FormEvent) {
    e.preventDefault();
    const p = resubmissionReasonProblem(reason);
    setProblem(p);
    if (!p) allow.mutate();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Lock" data-testid="resubmission-panel">
      <p className="flex items-center gap-2 font-semibold text-slate-900">
        {s.resubmissionOpen ? <Unlock className="h-4 w-4 text-amber-700" aria-hidden="true" /> : <Lock className="h-4 w-4 text-slate-700" aria-hidden="true" />}
        {s.resubmissionOpen ? "Resubmission allowed — waiting for the new version" : "Submitted and locked"}
      </p>
      <p className="mt-0.5 text-xs text-slate-700">
        {s.resubmissionOpen
          ? "The student or their teacher can submit once more before the deadline; the new version is locked again. Earlier versions are kept."
          : inMarking ? "Marking has begun: this answer can no longer be unlocked." : "Neither the student nor a teacher can replace it."}
      </p>
      {(allow.error || withdraw.error) && <div className="mt-2"><Alert tone="error">{errorMessage(allow.error ?? withdraw.error)}</Alert></div>}
      {may && s.resubmissionOpen && (
        <button type="button" className={`${btnSecondary} mt-2`} onClick={() => withdraw.mutate()} disabled={withdraw.isPending} data-testid="resubmission-withdraw">
          {withdraw.isPending ? "Withdrawing…" : "Withdraw the permission"}
        </button>
      )}
      {may && !s.resubmissionOpen && !inMarking && !asking && (
        <button type="button" className={`${btnPrimary} mt-2`} onClick={() => setAsking(true)} data-testid="resubmission-allow">Allow one more submission</button>
      )}
      {may && asking && (
        <form onSubmit={submit} noValidate className="mt-2 space-y-2">
          <label htmlFor="resubmission-reason" className="block text-xs font-semibold text-slate-800">Reason (kept in the history)</label>
          <textarea id="resubmission-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="For example: the wrong file was uploaded"
            aria-invalid={problem ? true : undefined} aria-describedby={problem ? "resubmission-reason-error" : undefined} data-testid="resubmission-reason" />
          {problem && <p id="resubmission-reason-error" className="text-xs text-red-700">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={allow.isPending} data-testid="resubmission-confirm">{allow.isPending ? "Allowing…" : "Allow"}</button>
            <button type="button" className={btnSecondary} onClick={() => { setAsking(false); setProblem(undefined); }}>Cancel</button>
          </div>
        </form>
      )}
      {history.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Resubmission history</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-800" data-testid="resubmission-history">
            {history.map((h) => (
              <li key={h.id}>
                {formatDateTime(h.authorizedAt)} · allowed{h.authorizedBy && ` by ${personName(h.authorizedBy)}`}: {h.reason} ·{" "}
                {h.state === "USED" ? `used by version ${h.usedVersion}` : h.state === "CANCELLED" ? `withdrawn${h.cancelledBy ? ` by ${personName(h.cancelledBy)}` : ""}` : "waiting"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
