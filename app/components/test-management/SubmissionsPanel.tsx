"use client";

/**
 * Submissions tab of a test (tests.viewSubmissions: Administrators; Head Coaches of the subject). Tracking: every
 * eligible student — submitted / not yet / late (blocked) / under extension — with counts, filters (state, school,
 * division, name) and pagination; one submission opens with EVERY version (submitter, teacher, time, the deadline that
 * applied, the under-extension mark, pages) and its status history. "Extended" is shown here only (never to markers).
 */
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { testTrackingApi, type StaffSubmissionDetail, type TrackingFilter } from "@/lib/api/test-submissions";
import { schoolsApi } from "@/lib/api/admin";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { EXTENSION_KIND_LABEL, SUBMISSION_STATUS_LABEL, SUBMITTER_LABEL, TRACKING_BADGE, TRACKING_FILTERS } from "@/lib/test-management/submissions";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { MetricCard, Modal, SearchInput, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "@/app/admin/components/adminUi";

export function ExtendedBadge({ label = "Extended" }: { label?: string }) {
  return <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-900" data-testid="extended-badge">{label}</span>;
}

export default function SubmissionsPanel({ testId }: { testId: string }) {
  const [status, setStatus] = useState<"" | TrackingFilter>("");
  const [division, setDivision] = useState<"" | "JUNIOR" | "SENIOR">("");
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
        <SelectFilter label="Division" value={division} onChange={(v) => reset(setDivision)(v as "" | "JUNIOR" | "SENIOR")}
          options={[{ label: "All divisions", value: "" }, { label: "Junior (S1–S3)", value: "JUNIOR" }, { label: "Senior (S4–S6)", value: "SENIOR" }]} />
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
                      <span className="font-semibold text-gray-900">{personName(r.student)}</span> <span className="text-gray-600">@{r.student.username}</span>
                      <span className="block text-gray-700">{r.student.gradeLevel ?? "—"}{r.student.school && ` · ${r.student.school.name}`}</span>
                    </td>
                    <td className={td}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${b.className}`}>{b.label}</span>
                      {r.extended && <span className="ml-1"><ExtendedBadge label={`Extended (${EXTENSION_KIND_LABEL[r.extensionKind ?? "STUDENT"].toLowerCase()})`} /></span>}
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
