"use client";

/**
 * "Find a submission" (`/admin/tests/submissions`; owner 2026-11-28; tests.reassignSubmission: Administrators and Super
 * Administrators): submitted answers across every test — search by student name, username, student ID, paper code or
 * test name; filter by programme, level and status — each with "Reassign" to correct its test and/or level. A table on
 * wide screens, a stacked list on phones (no sideways scrolling).
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { submissionReassignmentApi, type ReassignResult, type ReassignableRow, type SubmissionStatus } from "@/lib/api/test-submissions";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { useDivisionLabel, useTestLevelOptions } from "@/lib/queries/divisions";
import { SUBMISSION_STATUS_LABEL } from "@/lib/test-management/submissions";
import { TESTS_REASSIGN_SUBMISSION } from "@/lib/test-management/reassignment";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Card, Notice } from "@/app/admin/components/adminUi";
import { useTestSubjects } from "./shared";
import ReassignDialog from "./ReassignDialog";

const control =
  "w-full min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
const label = "mb-1 block text-xs font-semibold text-slate-800";
const reassignBtn =
  "inline-flex w-full items-center justify-center rounded-full border border-brand bg-white px-4 py-1.5 text-xs font-bold text-brand transition-colors hover:bg-brand-light sm:w-auto";

const STATUS_BADGE: Partial<Record<SubmissionStatus, string>> = {
  SUBMITTED: "bg-slate-100 text-slate-800",
  PUBLISHED: "bg-emerald-100 text-emerald-900",
  APPROVED: "bg-emerald-100 text-emerald-900",
  RETURNED: "bg-rose-100 text-rose-900",
};

export default function FindSubmission() {
  const { permissionsStatus, can } = useSession();
  if (permissionsStatus === "loading") return <LoadingBlock />;
  if (permissionsStatus === "ready" && !can(TESTS_REASSIGN_SUBMISSION)) {
    return (
      <PageFrame title="Find a submission">
        <Notice tone="info">Only Administrators and Super Administrators can find and reassign submissions.</Notice>
      </PageFrame>
    );
  }
  return <Finder />;
}

function Finder() {
  const qc = useQueryClient();
  const subjects = useTestSubjects();
  const levelOptions = useTestLevelOptions().filter((o) => o.value !== "ALL");
  const levelName = useDivisionLabel();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [level, setLevel] = useState("");
  const [status, setStatus] = useState<"" | SubmissionStatus>("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ReassignableRow | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // The search runs when typing pauses.
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== q) { setQ(text.trim()); setPage(1); } }, 350);
    return () => clearTimeout(t);
  }, [text, q]);

  const filters = { q: q || undefined, subjectId: subjectId || undefined, level: level || undefined, status: status || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.reassignable(filters), queryFn: () => submissionReassignmentApi.search(filters), placeholderData: keepPreviousData });
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  function moved(r: ReassignResult, row: ReassignableRow) {
    setOpen(null);
    setDone(`${personName(row.student)}'s answer (${row.publicCode}) now belongs to ${r.after.testTitle} · ${r.after.subjectName} · ${levelName(r.after.level)}.`);
    void qc.invalidateQueries({ queryKey: queryKeys.tests.all });
  }

  return (
    <PageFrame
      title="Find a submission"
      description="Correct an answer that was submitted under the wrong programme (subject) or level. The student does not submit again."
    >
      <nav aria-label="Breadcrumb" className="-mt-4 mb-4 text-xs text-slate-700">
        <Link href="/admin/tests" className="text-brand hover:underline">Tests</Link> › Find a submission
      </nav>
      {done && <Notice tone="success" onClose={() => setDone(null)}><span data-testid="reassign-success">{done}</span></Notice>}

      <Card className="mb-4 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <label htmlFor="find-submission-search" className={label}>Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input id="find-submission-search" type="search" maxLength={100} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="Student name, username, student ID, paper code or test name" className={`${control} pl-9`} data-testid="find-submission-search" />
            </div>
          </div>
          <div>
            <label htmlFor="find-submission-subject" className={label}>Programme / subject</label>
            <select id="find-submission-subject" className={control} value={subjectId} onChange={(e) => reset(setSubjectId)(e.target.value)} data-testid="find-submission-subject">
              <option value="">Any programme</option>
              {(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="find-submission-level" className={label}>Level</label>
            <select id="find-submission-level" className={control} value={level} onChange={(e) => reset(setLevel)(e.target.value)} data-testid="find-submission-level">
              <option value="">Any level</option>
              {levelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="find-submission-status" className={label}>Status</label>
            <select id="find-submission-status" className={control} value={status} onChange={(e) => reset(setStatus)(e.target.value as "" | SubmissionStatus)} data-testid="find-submission-status">
              <option value="">Any status</option>
              {(Object.keys(SUBMISSION_STATUS_LABEL) as SubmissionStatus[]).map((s) => <option key={s} value={s}>{SUBMISSION_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the submissions" onRetry={() => list.refetch()} /> : (
        <Card className="overflow-hidden">
          {list.data.data.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-700" data-testid="find-submission-empty">
              {q || subjectId || level || status ? "No submitted answer matches. Check the spelling, or clear a filter." : "No answer has been submitted yet."}
            </p>
          ) : (
            <>
              {/* Wide screens: a table. */}
              <table className="hidden w-full border-collapse text-left text-sm md:table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Test</th>
                    <th className="px-4 py-3">Programme</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3"><span className="sr-only">Reassign</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100" data-testid="find-submission-rows">
                  {list.data.data.map((r) => (
                    <tr key={r.id} data-testid={`find-row-${r.id}`}>
                      <td className="px-4 py-3">
                        <span className="block font-semibold text-slate-900">{personName(r.student)}</span>
                        <span className="font-mono text-xs text-slate-600">{r.student.username} · <span className="whitespace-nowrap">{r.publicCode}</span></span>
                      </td>
                      <td className="px-4 py-3 text-slate-900" data-testid="find-row-test">{r.test.title}</td>
                      <td className="px-4 py-3 text-slate-900" data-testid="find-row-subject">{r.test.discipline.name}</td>
                      <td className="px-4 py-3" data-testid="find-row-level"><LevelPill>{levelName(r.level)}</LevelPill></td>
                      <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDateTime(r.lastSubmittedAt ?? r.firstSubmittedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" className={reassignBtn} onClick={() => setOpen(r)} data-testid="reassign-open"
                          aria-label={`Reassign ${personName(r.student)}'s answer to ${r.test.title}`}>Reassign</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Phones: a stacked list (no sideways scrolling). */}
              <ul className="divide-y divide-slate-100 md:hidden" data-testid="find-submission-list">
                {list.data.data.map((r) => (
                  <li key={r.id} className="space-y-1.5 p-4" data-testid={`find-item-${r.id}`}>
                    <p className="font-semibold text-slate-900">{personName(r.student)}</p>
                    <p className="break-all font-mono text-xs text-slate-600">{r.student.username} · {r.publicCode}</p>
                    <p className="text-sm text-slate-900">{r.test.title}</p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                      {r.test.discipline.name} <LevelPill>{levelName(r.level)}</LevelPill> <StatusPill status={r.status} />
                    </p>
                    <p className="text-xs text-slate-700">Submitted {formatDateTime(r.lastSubmittedAt ?? r.firstSubmittedAt)}</p>
                    <button type="button" className={`${reassignBtn} mt-1`} onClick={() => setOpen(r)} data-testid="reassign-open"
                      aria-label={`Reassign ${personName(r.student)}'s answer to ${r.test.title}`}>Reassign</button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-100 px-4 py-3">
                <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
              </div>
            </>
          )}
        </Card>
      )}
      <p className="mt-4 text-xs text-slate-700">
        Also available on each test: Tests → (test) → Submissions → open a submission → <span className="font-semibold">Reassign submission</span>.
      </p>
      {open && <ReassignDialog testId={open.test.id} submissionId={open.id} onClose={() => setOpen(null)} onDone={(r) => moved(r, open)} />}
    </PageFrame>
  );
}

function LevelPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-bold text-brand">{children}</span>;
}

function StatusPill({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[status] ?? "bg-amber-100 text-amber-900"}`}>
      {SUBMISSION_STATUS_LABEL[status] ?? status}
    </span>
  );
}
