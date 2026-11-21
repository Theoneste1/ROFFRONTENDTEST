"use client";

/**
 * Test lists for the people who answer (Test Management Phase 2):
 *   - MyTests (`/student/tests`): the student's tests with the deadline that applies to them (extension included), the
 *     window and their submission;
 *   - TeacherTests (`/teacher/tests`): published tests with how many of the teacher's (verified) students may answer and
 *     have submitted;
 *   - TeacherTestStudents (`/teacher/tests/:id`): those students, each one's deadline (when this teacher submits), state
 *     and submission, with counts and filters.
 * Cards on phones, tables from `md`. No "extended" mark anywhere here (staff only).
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { myTestsApi, teacherTestsApi, type AnswerWindow, type OlympiadSubjectCode, type TestLevel, type TrackingState } from "@/lib/api/test-submissions";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { subjectLabel } from "@/lib/accounts/olympiad-interests";
import { isApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { ANSWER_FORMAT_LABEL, DIVISION_LABEL } from "@/lib/test-management/rules";
import { SUBMISSION_STATUS_LABEL, SUBMITTER_LABEL, TESTS_SUBMIT, TESTS_SUBMIT_FOR_STUDENTS, TRACKING_BADGE, answerActionLabel, submissionLockSupported } from "@/lib/test-management/submissions";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, PageFrame } from "@/app/components/ui/PageFrame";
import { MetricCard, Notice, SearchInput, TableCard, TableMessage, td, th } from "@/app/admin/components/adminUi";
import { AnswerGate, WindowBadge } from "./AnswerWorkspace";

const WINDOWS: { label: string; value: "" | AnswerWindow }[] = [
  { label: "All", value: "" },
  { label: "Open", value: "OPEN" },
  { label: "Not open yet", value: "UPCOMING" },
  { label: "Closed", value: "CLOSED" },
];

export function MyTests() {
  return (
    <AnswerGate title="My tests" permission={TESTS_SUBMIT}>
      <Mine />
    </AnswerGate>
  );
}

/** Levels and subjects the teacher filters by (testSubmissionLock). ROF has two levels: Junior (S1–S3), Senior (S4–S6). */
const LEVELS: { label: string; value: "" | TestLevel }[] = [
  { label: "All", value: "" },
  { label: "Junior (S1–S3)", value: "JUNIOR" },
  { label: "Senior (S4–S6)", value: "SENIOR" },
];
const SUBJECTS: { label: string; value: "" | OlympiadSubjectCode }[] = [
  { label: "All", value: "" },
  { label: "Mathematics", value: "MATHEMATICS" },
  { label: "Physics", value: "PHYSICS" },
  { label: "Computing", value: "COMPUTING" },
];

/** A small "Locked" mark: submitted, and only an Administrator can allow another version. */
export function LockedMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800" title="Submitted and locked: only an administrator can allow it to be submitted again" data-testid="locked-badge">
      <Lock className="h-3 w-3" aria-hidden="true" /> Locked
    </span>
  );
}

function Mine() {
  const lockAware = submissionLockSupported(useBackendCapabilities().detection);
  const [win, setWin] = useState<"" | AnswerWindow>("");
  const [page, setPage] = useState(1);
  const filters = { window: win || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.mine(filters), queryFn: () => myTestsApi.list(filters), placeholderData: keepPreviousData });
  return (
    <PageFrame title="My tests" description="Tests of your division. The deadline shown is yours, including any extension you were given.">
      <div className="mb-4"><FilterPills label="Tests" options={WINDOWS} value={win} onChange={(v) => { setWin(v); setPage(1); }} /></div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load your tests" onRetry={() => list.refetch()} /> : list.data.data.length === 0 ? (
        <EmptyState title="No tests" description={win ? "No test in this group." : "When a test is published for your division, it appears here."} />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="my-tests">
            {list.data.data.map((t) => (
              <li key={t.id}>
                <Link href={`/student/tests/${t.id}`} className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                  data-testid={`my-test-${t.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold text-slate-900">{t.title}</p>
                    <WindowBadge window={t.window} />
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{t.subject.name} · {DIVISION_LABEL[t.division]} · {ANSWER_FORMAT_LABEL[t.answerFormat]} · {t.maxMarks} marks</p>
                  <p className="mt-2 text-sm text-slate-900">{t.window === "UPCOMING" ? <>Opens {formatDateTime(t.opensAt)}</> : <>Deadline <span className="font-semibold">{formatDateTime(t.deadline)}</span></>}</p>
                  <p className="mt-1 flex items-center justify-between text-xs">
                    <span className={`inline-flex items-center gap-2 ${t.submission ? "font-semibold text-emerald-800" : "text-slate-700"}`}>
                      {t.submission ? `${SUBMISSION_STATUS_LABEL[t.submission.status]} · ${t.submission.versionCount} ${t.submission.versionCount === 1 ? "version" : "versions"}` : "Not submitted"}
                      {t.submission?.locked && <LockedMark />}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-indigo-800">{t.canSubmit ? (t.submission ? (lockAware ? "Submit again" : "Replace") : "Answer") : "Open"} <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
    </PageFrame>
  );
}

export function TeacherTests() {
  return (
    <AnswerGate title="Tests" permission={TESTS_SUBMIT_FOR_STUDENTS}>
      <TeacherList />
    </AnswerGate>
  );
}

function TeacherList() {
  const [win, setWin] = useState<"" | AnswerWindow>("");
  const [page, setPage] = useState(1);
  const filters = { window: win || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.teacher(filters), queryFn: () => teacherTestsApi.list(filters), placeholderData: keepPreviousData });
  return (
    <PageFrame title="Tests" description="Published tests. You can submit and replace answers for the verified students of your schools, until their deadline.">
      <div className="mb-4"><FilterPills label="Tests" options={WINDOWS} value={win} onChange={(v) => { setWin(v); setPage(1); }} /></div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the tests" onRetry={() => list.refetch()} /> : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Test</th>
                <th className={th}>Deadline</th>
                <th className={th}>Your students</th>
                <th className={th}><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="teacher-tests">
              {list.data.data.length === 0 ? <TableMessage colSpan={4}>No published test yet.</TableMessage> : list.data.data.map((t) => (
                <tr key={t.id} className="text-xs" data-testid={`teacher-test-${t.id}`}>
                  <td className={td}>
                    <span className="font-semibold text-gray-900">{t.title}</span> <WindowBadge window={t.window} />
                    <span className="block text-gray-700">{t.subject.name} · {DIVISION_LABEL[t.division]} · {ANSWER_FORMAT_LABEL[t.answerFormat]}</span>
                  </td>
                  <td className={`${td} text-gray-800`}>{t.window === "UPCOMING" ? `Opens ${formatDateTime(t.opensAt)}` : formatDateTime(t.deadline)}</td>
                  <td className={`${td} text-gray-800`}>{t.submitted} of {t.students} submitted</td>
                  <td className={`${td} whitespace-nowrap`}><Link href={`/teacher/tests/${t.id}`} className="font-semibold text-indigo-700 hover:underline" aria-label={`Students for ${t.title}`}>Students</Link></td>
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
    </PageFrame>
  );
}

const STATES: { label: string; value: "" | TrackingState }[] = [
  { label: "All", value: "" },
  { label: "Submitted", value: "SUBMITTED" },
  { label: "Not yet", value: "NOT_SUBMITTED" },
  { label: "Late (blocked)", value: "LATE_BLOCKED" },
];

export function TeacherTestStudents({ testId }: { testId: string }) {
  return (
    <AnswerGate title="Students" permission={TESTS_SUBMIT_FOR_STUDENTS}>
      <StudentsOfTest testId={testId} />
    </AnswerGate>
  );
}

function StudentsOfTest({ testId }: { testId: string }) {
  const lockAware = submissionLockSupported(useBackendCapabilities().detection);
  const [status, setStatus] = useState<"" | TrackingState>("");
  const [level, setLevel] = useState<"" | TestLevel>("");
  const [subject, setSubject] = useState<"" | OlympiadSubjectCode>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const filters = {
    status: status || undefined, q: q || undefined, page, limit: 20,
    ...(lockAware && { division: level || undefined, subject: subject || undefined }),
  };
  const list = useQuery({ queryKey: queryKeys.tests.teacherStudents(testId, filters), queryFn: () => teacherTestsApi.students(testId, filters), placeholderData: keepPreviousData });
  const back = (
    <Link href="/teacher/tests" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All tests
    </Link>
  );
  if (list.isError && isApiError(list.error) && list.error.status === 404) {
    return <PageFrame title="Students">{back}<Notice tone="info">This test is not available.</Notice></PageFrame>;
  }
  const c = list.data?.counts;
  return (
    <PageFrame title="Students for this test" description={lockAware
      ? "The students who registered with your school code, in the test's level. Open a student to submit their answer; once submitted it is locked."
      : "Verified students of your schools in the test's division. Open a student to submit or replace their answer."}>
      {back}
      {c && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="teacher-counts">
          <MetricCard label="Students" value={c.students} />
          <MetricCard label="Submitted" value={c.submitted} />
          <MetricCard label="Not yet" value={c.notSubmitted} />
          <MetricCard label="Late (blocked)" value={c.lateBlocked} />
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterPills label="State" options={STATES} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        {lockAware && <FilterPills label="Level" options={LEVELS} value={level} onChange={(v) => { setLevel(v); setPage(1); }} />}
        {lockAware && <FilterPills label="Subject" options={SUBJECTS} value={subject} onChange={(v) => { setSubject(v); setPage(1); }} />}
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search students" label="Search students" />
      </div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the students" onRetry={() => list.refetch()} /> : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Student</th>
                {lockAware && <th className={th}>Level · subjects</th>}
                <th className={th}>Deadline</th>
                <th className={th}>State</th>
                <th className={th}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="teacher-students">
              {list.data.data.length === 0 ? <TableMessage colSpan={lockAware ? 5 : 4}>No student here.</TableMessage> : list.data.data.map((r) => {
                const b = TRACKING_BADGE[r.state];
                const action = answerActionLabel(r.canSubmit, r.submission !== null, lockAware);
                const subjects = [...(r.student.olympiadInterests ?? []).map(subjectLabel), ...(r.student.olympiadInterestOther ? [r.student.olympiadInterestOther] : [])];
                return (
                  <tr key={r.student.id} className="text-xs" data-testid={`student-row-${r.student.username}`}>
                    <td className={td}>
                      <span className="font-semibold text-gray-900">{personName(r.student)}</span> <span className="text-gray-600">@{r.student.username}</span>
                      <span className="block text-gray-700">{r.student.gradeLevel ?? "—"}{r.student.school && ` · ${r.student.school.name}`}</span>
                    </td>
                    {lockAware && (
                      <td className={`${td} text-gray-800`} data-testid="student-level-subjects">
                        <span className="font-semibold">{r.student.division ? DIVISION_LABEL[r.student.division] : "—"}</span>
                        <span className="block text-gray-700">{subjects.length ? subjects.join(", ") : "—"}</span>
                      </td>
                    )}
                    <td className={`${td} text-gray-800`}>{formatDateTime(r.deadline)}</td>
                    <td className={td}>
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${b.className}`}>{b.label}</span>
                        {r.submission?.locked && <LockedMark />}
                      </span>
                      {r.submission && (
                        <span className="block text-gray-700">{r.submission.versionCount} {r.submission.versionCount === 1 ? "version" : "versions"} · last by {r.submission.lastSubmitterRole ? SUBMITTER_LABEL[r.submission.lastSubmitterRole].toLowerCase() : "—"}</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/teacher/tests/${testId}/students/${r.student.id}`} className="font-semibold text-indigo-700 hover:underline"
                        aria-label={`${action} for ${personName(r.student)}`}>
                        {action}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
    </PageFrame>
  );
}
