"use client";

/**
 * Test Management, Phase 4 (capability `testResults`) — results pages for the people who answer, the reporting
 * overview, and the test widgets of the role dashboards:
 *   - MyResults / MyResult (`/student/results`, `/student/results/:testId`; tests.viewOwnResults): the student's own
 *     PUBLISHED results — marks per question, total, comments. Never a rank, never who marked. An unpublished or withdrawn
 *     result is simply not there (404 → "not published").
 *   - SchoolResultTests / SchoolResults / SchoolResult (`/teacher/results…`; tests.viewSchoolResults): published results of
 *     the teacher's schools' students, by name. Never a rank.
 *   - TestReports (`/admin/test-reports`, `/mentor/test-reports`; tests.viewResults): tests with counts and averages.
 *   - Dashboard widgets: StaffTestsWidget (tests.view), CoachTestsWidget (tests.mark), TeacherTestsWidget
 *     (tests.submitForStudents), StudentTestsWidget (tests.submit) — each only with the feature and the permission.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { coachDashboardApi, coachResultsApi, myResultsApi, schoolResultsApi, testResultsApi, type PublishedResult } from "@/lib/api/test-results";
import { isApiError } from "@/lib/api/errors";
import type { Permission } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { formatDateTime, personName } from "@/lib/format";
import {
  TESTS_VIEW_OWN_RESULTS, TESTS_VIEW_PROGRAMME_RESULTS, TESTS_VIEW_RESULTS, TESTS_VIEW_SCHOOL_RESULTS, resultsPageMode, resultsTabVisible, scoreText, statText, testPageOf,
} from "@/lib/test-management/results";
import { SUBMISSION_STATUS_LABEL } from "@/lib/test-management/submissions";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { MetricCard, Notice, SearchInput, TableCard, TableMessage, td, th } from "@/app/admin/components/adminUi";
import StudentName from "@/app/components/students/StudentName";

/** The results pages when the backend has no Phase 4 or the user lacks the permission; otherwise the children. */
export function ResultsGate({ title, permission, children }: { title: string; permission: Permission; children: ReactNode }) {
  const { permissionsStatus, can, retry } = useSession();
  const caps = useBackendCapabilities();
  const mode = resultsPageMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can, permission });
  if (mode === "visible") return <>{children}</>;
  return (
    <PageFrame title={title}>
      {mode === "loading" && <LoadingBlock />}
      {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retry} />}
      {mode === "unsupported" && <Notice tone="info">This server does not provide test results yet.</Notice>}
      {mode === "forbidden" && <Notice tone="info">Test results are not available for this account.</Notice>}
    </PageFrame>
  );
}

/** Whether a dashboard widget shows: the feature and the known permission (never while unknown). */
function useWidget(permission: Permission): boolean {
  const { permissionsStatus, can } = useSession();
  const { detection } = useBackendCapabilities();
  return resultsTabVisible(detection, permissionsStatus === "ready" && can(permission));
}

const card = "rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200";

// ── One published result (student or teacher) ──────────────────────────────────

function ResultBody({ r }: { r: PublishedResult }) {
  return (
    <div className="space-y-4" data-testid="published-result">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Total</p>
          <p className="text-3xl font-bold text-slate-900" data-testid="result-total">{scoreText(r.result.totalMarks, r.result.maxMarks)}</p>
        </div>
        <p className="text-xs text-slate-700">Published {r.publishedAt ? formatDateTime(r.publishedAt) : ""}</p>
      </div>
      {r.result.comment && (
        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Comment</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900" data-testid="result-comment">{r.result.comment}</p>
        </div>
      )}
      {r.result.questions.length > 0 && (
        <ol className="space-y-3" data-testid="result-questions">
          {r.result.questions.map((q) => (
            <li key={q.order} className={card} data-testid={`result-q${q.order}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-900"><span className="font-bold">{q.order}.</span> <span className="whitespace-pre-wrap">{q.prompt}</span></p>
                <span className="whitespace-nowrap text-sm font-bold text-slate-900">{scoreText(q.marks, q.maxMarks)}</span>
              </div>
              {q.comment && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{q.comment}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NotPublished({ back, backLabel }: { back: string; backLabel: string }) {
  return (
    <div className="space-y-3" data-testid="result-not-published">
      <EmptyState title="No published result" description="This result is not published (or it was withdrawn for review). It appears here once published." />
      <Link href={back} className="text-sm font-medium text-indigo-700 hover:underline">{backLabel}</Link>
    </div>
  );
}

// ── Student ────────────────────────────────────────────────────────────────────

export function MyResults() {
  return <ResultsGate title="My results" permission={TESTS_VIEW_OWN_RESULTS}><MyResultsList /></ResultsGate>;
}

function MyResultsList() {
  const [page, setPage] = useState(1);
  const f = { page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.myResults(f), queryFn: () => myResultsApi.list(f), placeholderData: keepPreviousData });
  return (
    <PageFrame title="My results" description="Your published test results: marks per question, total and comments.">
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load your results" onRetry={() => list.refetch()} /> : list.data.data.length === 0 ? (
        <EmptyState title="No results yet" description="When results of a test you answered are published, they appear here." />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="my-results">
            {list.data.data.map((r) => (
              <li key={r.test.id}>
                <Link href={`/student/results/${r.test.id}`} className={`${card} block transition hover:ring-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600`} data-testid={`my-result-${r.test.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold text-slate-900">{r.test.title}</p>
                    <span className="whitespace-nowrap text-sm font-bold text-slate-900">{scoreText(r.totalMarks, r.maxMarks)}</span>
                  </div>
                  <p className="mt-1 flex items-center justify-between text-xs text-slate-700">
                    <span>{r.test.subject.name} · published {r.publishedAt ? formatDateTime(r.publishedAt) : ""}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} />
        </>
      )}
    </PageFrame>
  );
}

export function MyResult({ testId }: { testId: string }) {
  return <ResultsGate title="My result" permission={TESTS_VIEW_OWN_RESULTS}><MyResultView testId={testId} /></ResultsGate>;
}

function MyResultView({ testId }: { testId: string }) {
  const r = useQuery({ queryKey: queryKeys.tests.myResult(testId), queryFn: () => myResultsApi.get(testId), retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });
  const back = <Link href="/student/results" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> My results</Link>;
  if (r.isPending) return <PageFrame title="My result"><LoadingBlock /></PageFrame>;
  if (r.isError) {
    return (
      <PageFrame title="My result">
        {isApiError(r.error) && r.error.status === 404 ? <NotPublished back="/student/results" backLabel="Back to my results" /> : <ErrorState error={r.error} title="Couldn't load your result" onRetry={() => r.refetch()} />}
      </PageFrame>
    );
  }
  return (
    <PageFrame title={r.data.test.title} description={`${r.data.test.subject.name} · your result`}>
      {back}
      <ResultBody r={r.data} />
    </PageFrame>
  );
}

// ── Teacher (their schools' students) and Coach (their programmes, owner 2026-11-23) ─────────────────

/** Who is looking: a teacher (their schools' students) or a coach (every student of their programmes, every level). */
export type ResultAudience = "teacher" | "coach";

function audienceOf(audience: ResultAudience) {
  return audience === "coach"
    ? { api: coachResultsApi, base: "/mentor/results", permission: TESTS_VIEW_PROGRAMME_RESULTS, whose: "the students of your programmes, every level" }
    : { api: schoolResultsApi, base: "/teacher/results", permission: TESTS_VIEW_SCHOOL_RESULTS, whose: "the students of your school" };
}

export function SchoolResultTests({ audience = "teacher" }: { audience?: ResultAudience }) {
  return <ResultsGate title="Results" permission={audienceOf(audience).permission}><SchoolTestsList audience={audience} /></ResultsGate>;
}

function SchoolTestsList({ audience }: { audience: ResultAudience }) {
  const [page, setPage] = useState(1);
  const f = { page, limit: 20 };
  const a = audienceOf(audience);
  const list = useQuery({ queryKey: queryKeys.tests.schoolResultTests({ ...f, audience }), queryFn: () => a.api.tests(f), placeholderData: keepPreviousData });
  return (
    <PageFrame title="Results" description={`Published test results of ${a.whose}.`}>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the results" onRetry={() => list.refetch()} /> : list.data.data.length === 0 ? (
        <EmptyState title="No published results" description="When results of your students are published, the test appears here." />
      ) : (
        <TableCard footer={<Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} />}>
          <thead><tr className="border-b border-gray-100"><th className={th}>Test</th><th className={th}>Subject</th><th className={th}>Published results</th><th className={th}>Last published</th></tr></thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="school-result-tests">
            {list.data.data.map((t) => (
              <tr key={t.test.id} className="text-sm">
                <td className={td}><Link href={`${a.base}/${t.test.id}`} className="font-semibold text-indigo-700 hover:underline" data-testid={`school-test-${t.test.id}`}>{t.test.title}</Link></td>
                <td className={`${td} text-gray-700`}>{t.test.subject.name}</td>
                <td className={td}>{t.publishedResults}</td>
                <td className={`${td} whitespace-nowrap text-gray-700`}>{t.lastPublishedAt ? formatDateTime(t.lastPublishedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </PageFrame>
  );
}

export function SchoolResults({ testId, audience = "teacher" }: { testId: string; audience?: ResultAudience }) {
  return <ResultsGate title="Results" permission={audienceOf(audience).permission}><SchoolResultsList testId={testId} audience={audience} /></ResultsGate>;
}

function SchoolResultsList({ testId, audience }: { testId: string; audience: ResultAudience }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const f = { ...(q && { q }), page, limit: 25 };
  const a = audienceOf(audience);
  const list = useQuery({ queryKey: queryKeys.tests.schoolResults(testId, { ...f, audience }), queryFn: () => a.api.results(testId, f), placeholderData: keepPreviousData, retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });
  const back = <Link href={a.base} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All results</Link>;
  if (list.isPending) return <PageFrame title="Results"><LoadingBlock /></PageFrame>;
  if (list.isError) {
    return <PageFrame title="Results">{isApiError(list.error) && list.error.status === 404 ? <NotPublished back={a.base} backLabel="Back to results" /> : <ErrorState error={list.error} title="Couldn't load the results" onRetry={() => list.refetch()} />}</PageFrame>;
  }
  const d = list.data;
  return (
    <PageFrame title={d.test.title} description={`${d.test.subject.name} · published results of ${a.whose}, by name`}>
      {back}
      <div className="mb-4"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Student name or username" label="Search students" /></div>
      <TableCard footer={<Pagination page={d.meta.page} totalPages={d.meta.totalPages} total={d.meta.total} onPage={setPage} />}>
        <thead><tr className="border-b border-gray-100"><th className={th}>Student</th><th className={th}>Grade</th><th className={th}>School</th><th className={th}>Total</th><th className={th}><span className="sr-only">Open</span></th></tr></thead>
        <tbody className="divide-y divide-gray-100/80" data-testid="school-results">
          {d.data.length === 0 ? <TableMessage colSpan={5}>No published result{q ? " matches" : " yet"}.</TableMessage> : d.data.map((r) => (
            <tr key={r.student.id} className="text-sm" data-testid={`school-result-${r.student.id}`}>
              <td className={`${td} font-semibold text-gray-900`}><StudentName student={r.student} /></td>
              <td className={`${td} text-gray-700`}>{r.student.gradeLevel ?? "—"}</td>
              <td className={`${td} text-gray-700`}>{r.student.school?.name ?? "—"}</td>
              <td className={`${td} font-semibold`}>{scoreText(r.totalMarks, r.maxMarks)}</td>
              <td className={td}><Link href={`${a.base}/${testId}/students/${r.student.id}`} className="font-medium text-indigo-700 hover:underline">Details<span className="sr-only"> for {personName(r.student)}</span></Link></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </PageFrame>
  );
}

export function SchoolResult({ testId, studentId, audience = "teacher" }: { testId: string; studentId: string; audience?: ResultAudience }) {
  return <ResultsGate title="Result" permission={audienceOf(audience).permission}><SchoolResultView testId={testId} studentId={studentId} audience={audience} /></ResultsGate>;
}

function SchoolResultView({ testId, studentId, audience }: { testId: string; studentId: string; audience: ResultAudience }) {
  const a = audienceOf(audience);
  const r = useQuery({ queryKey: [...queryKeys.tests.schoolResult(testId, studentId), audience], queryFn: () => a.api.get(testId, studentId), retry: (n, e) => !(isApiError(e) && e.status === 404) && n < 2 });
  const backHref = `${a.base}/${testId}`;
  if (r.isPending) return <PageFrame title="Result"><LoadingBlock /></PageFrame>;
  if (r.isError) {
    return <PageFrame title="Result">{isApiError(r.error) && r.error.status === 404 ? <NotPublished back={backHref} backLabel="Back to the test's results" /> : <ErrorState error={r.error} title="Couldn't load the result" onRetry={() => r.refetch()} />}</PageFrame>;
  }
  return (
    <PageFrame title={r.data.student ? personName(r.data.student) : "Result"} description={`${r.data.test.title} · ${r.data.test.subject.name}`}>
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> The test&apos;s results</Link>
      <ResultBody r={r.data} />
    </PageFrame>
  );
}

// ── Reporting overview (Administrators, Head Coaches) ──────────────────────────

export function TestReports({ portal }: { portal: "admin" | "mentor" }) {
  return <ResultsGate title="Test reports" permission={TESTS_VIEW_RESULTS}><Reports portal={portal} /></ResultsGate>;
}

function Reports({ portal }: { portal: "admin" | "mentor" }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const f = { ...(q && { q }), page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.reports(f), queryFn: () => testResultsApi.overview(f), placeholderData: keepPreviousData });
  return (
    <PageFrame title="Test reports" description="Published tests with their submissions, approved results, averages and publications.">
      <div className="mb-4"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Test title" label="Search tests" /></div>
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the reports" onRetry={() => list.refetch()} /> : (
        <TableCard footer={<Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} />}>
          <thead><tr className="border-b border-gray-100">
            <th className={th}>Test</th><th className={th}>Subject</th><th className={th}>Submissions</th><th className={th}>Not approved</th><th className={th}>Results</th>
            <th className={th}>Average</th><th className={th}>Published</th><th className={th}>Last published</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="test-reports">
            {list.data.data.length === 0 ? <TableMessage colSpan={8}>No published test{q ? " matches" : " yet"}.</TableMessage> : list.data.data.map((t) => (
              <tr key={t.id} className="text-sm" data-testid={`report-${t.id}`}>
                <td className={td}>
                  <Link href={testPageOf(portal, t.id, "results")} className="font-semibold text-indigo-700 hover:underline">{t.title}</Link>
                  <Link href={testPageOf(portal, t.id, "publishing")} className="block text-xs text-indigo-700 hover:underline">Publishing<span className="sr-only"> of {t.title}</span></Link>
                </td>
                <td className={`${td} text-gray-700`}>{t.subject.name}</td>
                <td className={td}>{t.counts.total}</td>
                <td className={td}>{t.counts.unapproved}</td>
                <td className={td}>{t.results}</td>
                <td className={`${td} font-semibold`}>{t.average === null ? "—" : `${statText(t.average)} / ${t.maxMarks}`}</td>
                <td className={td}>{t.counts.published}{t.publications ? <span className="block text-xs text-gray-600">{t.publications} publication{t.publications === 1 ? "" : "s"}</span> : null}</td>
                <td className={`${td} whitespace-nowrap text-gray-700`}>{t.lastPublishedAt ? formatDateTime(t.lastPublishedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </PageFrame>
  );
}

// ── Dashboard widgets ──────────────────────────────────────────────────────────

function Widget({ title, testId, children, link }: { title: string; testId: string; children: ReactNode; link?: { href: string; label: string } }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label={title} data-testid={testId}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">{title}</h2>
        {link && <Link href={link.href} className="text-sm font-medium text-indigo-700 hover:underline">{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}

const small = "text-sm text-slate-800";

/** Administrators and Head Coaches (spec 12.1 / 12.3). `portal`: where the test pages are. */
export function StaffTestsWidget({ portal }: { portal: "admin" | "mentor" }) {
  const show = useWidget("tests.view");
  const { can } = useSession();
  const d = useQuery({ queryKey: queryKeys.tests.dashboard("staff"), queryFn: testResultsApi.dashboard, enabled: show });
  if (!show) return null;
  return (
    <Widget title="Tests" testId="tests-widget-staff" link={{ href: `/${portal}/tests`, label: "All tests" }}>
      {can(TESTS_VIEW_RESULTS) && <Link href={`/${portal}/test-reports`} className="mb-3 inline-block text-sm font-medium text-indigo-700 hover:underline" data-testid="widget-test-reports">Test reports</Link>}
      {d.isPending ? <LoadingBlock /> : d.isError ? <ErrorState error={d.error} title="Couldn't load the tests overview" onRetry={() => d.refetch()} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {d.data.subjects.map((s) => (
              <div key={s.subject.id} className="rounded-xl border border-slate-200 p-3" data-testid={`subject-${s.subject.code}`}>
                <p className="font-bold text-slate-900">{s.subject.name}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-800">
                  <dt>Tests (published / draft)</dt><dd className="font-semibold">{s.tests.published} / {s.tests.draft}</dd>
                  <dt>Submissions</dt><dd className="font-semibold">{s.submissions.total}</dd>
                  <dt>Awaiting approval</dt><dd className="font-semibold">{s.pendingReview}</dd>
                  <dt>Returned</dt><dd className="font-semibold">{s.returned}</dd>
                  <dt>Second marking</dt><dd className="font-semibold">{s.awaitingSecondMarking}</dd>
                  <dt>Ready to publish</dt><dd className="font-semibold" data-testid="ready-to-publish">{s.readyToPublish}</dd>
                  <dt>Published</dt><dd className="font-semibold">{s.submissions.published}</dd>
                  <dt>Active extensions</dt><dd className="font-semibold">{s.activeExtensions}</dd>
                  <dt>Authorised markers</dt><dd className="font-semibold">{s.authorisedMarkers}</dd>
                  <dt>Head Coaches</dt><dd className="font-semibold">{s.headCoaches}</dd>
                </dl>
              </div>
            ))}
          </div>
          {d.data.tests.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Latest tests</h3>
              <ul className="divide-y divide-slate-100 text-sm" data-testid="widget-tests">
                {d.data.tests.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={testPageOf(portal, t.id)} className="font-semibold text-indigo-700 hover:underline">{t.title}</Link>
                    <span className="text-xs text-slate-700">
                      {t.counts.total} submitted · {t.counts.byStatus.MARKED ?? 0} awaiting approval · {t.counts.approved} ready · {t.counts.published} published
                      {t.activeExtensions > 0 && ` · ${t.activeExtensions} extensions`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Marking progress per coach</h3>
              {d.data.coaches.length === 0 ? <p className={small}>No marking assigned.</p> : (
                <ul className="space-y-1 text-sm" data-testid="widget-coaches">
                  {d.data.coaches.map((c) => (
                    <li key={c.coach.id} className="flex justify-between gap-2"><span>{personName(c.coach)}</span><span className="text-xs text-slate-700">{c.marked} / {c.assigned} marked{c.returned ? ` · ${c.returned} returned` : ""}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Ranking (internal){d.data.rankings && <> — {d.data.rankings.test.title}</>}</h3>
              {!d.data.rankings ? <p className={small}>No published results yet.</p> : (
                <ol className="space-y-1 text-sm" data-testid="widget-ranking">
                  {d.data.rankings.top.map((r) => (
                    <li key={r.student.id} className="flex justify-between gap-2"><span><span className="font-bold">{r.rank}.</span> {personName(r.student)}{r.school && <span className="text-xs text-slate-600"> · {r.school}</span>}</span><span className="font-semibold">{scoreText(r.totalMarks, d.data.rankings?.test.maxMarks ?? 0)}</span></li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </Widget>
  );
}

/** Coaches (spec 12.2): their own assigned marking only (blind). */
export function CoachTestsWidget() {
  const show = useWidget("tests.mark");
  const d = useQuery({ queryKey: queryKeys.tests.dashboard("coach"), queryFn: coachDashboardApi.dashboard, enabled: show });
  if (!show) return null;
  return (
    <Widget title="My marking" testId="tests-widget-coach" link={{ href: "/mentor/marking", label: "Marking queue" }}>
      {d.isPending ? <LoadingBlock /> : d.isError ? <ErrorState error={d.error} title="Couldn't load your marking" onRetry={() => d.refetch()} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Needs action" value={<span data-testid="coach-needs-action">{d.data.counts.needsAction}</span>} />
            <MetricCard label="Not started" value={d.data.counts.notStarted} />
            <MetricCard label="In progress" value={d.data.counts.inProgress} />
            <MetricCard label="Marked" value={<span data-testid="coach-marked">{d.data.counts.marked}</span>} />
            <MetricCard label="Returned" value={d.data.counts.returned} />
            <MetricCard label="Second markings" value={d.data.counts.secondMarkings} />
          </div>
          {d.data.tests.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.data.tests.map((t) => (
                <li key={t.test.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-semibold">{t.test.title} <span className="text-xs font-normal text-slate-600">{t.test.subject}</span></span><span className="text-xs text-slate-700">{t.marked} / {t.assigned} marked{t.returned ? ` · ${t.returned} returned` : ""}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Widget>
  );
}

/** Teachers (spec 12.4): open tests with their students submitted / missing, extensions, published results. */
export function TeacherTestsWidget() {
  const show = useWidget("tests.submitForStudents");
  const d = useQuery({ queryKey: queryKeys.tests.dashboard("teacher"), queryFn: schoolResultsApi.dashboard, enabled: show });
  if (!show) return null;
  return (
    <Widget title="Tests" testId="tests-widget-teacher" link={{ href: "/teacher/tests", label: "All tests" }}>
      {d.isPending ? <LoadingBlock /> : d.isError ? <ErrorState error={d.error} title="Couldn't load the tests" onRetry={() => d.refetch()} /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Open now ({d.data.counts.openTests})</h3>
            {d.data.open.length === 0 ? <p className={small}>No open test.</p> : (
              <ul className="space-y-2 text-sm">
                {d.data.open.map((t) => (
                  <li key={t.id}><Link href={`/teacher/tests/${t.id}`} className="font-semibold text-indigo-700 hover:underline">{t.title}</Link>
                    <span className="block text-xs text-slate-700">{t.submitted} submitted · {t.missing} missing · deadline {formatDateTime(t.deadline)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Extensions</h3>
            {d.data.extensions.length === 0 ? <p className={small}>None running.</p> : (
              <ul className="space-y-1 text-xs text-slate-800">
                {d.data.extensions.map((e) => <li key={e.id}>{e.test.title}: {e.kind === "TEACHER" ? "your submissions" : personName(e.student)} until {formatDateTime(e.newDeadline)}</li>)}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Published results</h3>
            {d.data.results.length === 0 ? <p className={small}>None yet.</p> : (
              <ul className="space-y-1 text-sm" data-testid="teacher-widget-results">
                {d.data.results.map((r) => <li key={r.test.id}><Link href={`/teacher/results/${r.test.id}`} className="font-semibold text-indigo-700 hover:underline">{r.test.title}</Link> <span className="text-xs text-slate-700">· {r.publishedResults} students</span></li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </Widget>
  );
}

/** Students (spec 12.5): open and upcoming tests with their own deadline, submissions, published results. */
export function StudentTestsWidget() {
  const show = useWidget("tests.submit");
  const d = useQuery({ queryKey: queryKeys.tests.dashboard("student"), queryFn: myResultsApi.dashboard, enabled: show });
  if (!show) return null;
  return (
    <Widget title="Tests" testId="tests-widget-student" link={{ href: "/student/tests", label: "My tests" }}>
      {d.isPending ? <LoadingBlock /> : d.isError ? <ErrorState error={d.error} title="Couldn't load your tests" onRetry={() => d.refetch()} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Open" value={d.data.counts.open} />
            <MetricCard label="Coming up" value={d.data.counts.upcoming} />
            <MetricCard label="Awaiting results" value={d.data.counts.awaitingResults} />
            <MetricCard label="Results" value={<span data-testid="student-results-count">{d.data.counts.publishedResults}</span>} />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Open and coming up</h3>
              {d.data.open.length + d.data.upcoming.length === 0 ? <p className={small}>No test right now.</p> : (
                <ul className="space-y-2 text-sm">
                  {[...d.data.open, ...d.data.upcoming].map((t) => (
                    <li key={t.id}><Link href={`/student/tests/${t.id}`} className="font-semibold text-indigo-700 hover:underline">{t.title}</Link>
                      <span className="block text-xs text-slate-700">{t.window === "UPCOMING" ? `Opens ${formatDateTime(t.opensAt)}` : `Your deadline ${formatDateTime(t.deadline)}`}
                        {"submission" in t && t.submission && typeof t.submission === "object" && "status" in t.submission ? ` · ${SUBMISSION_STATUS_LABEL[(t.submission as { status: keyof typeof SUBMISSION_STATUS_LABEL }).status]}` : ""}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Published results</h3>
              {d.data.results.length === 0 ? <p className={small}>None yet.</p> : (
                <ul className="space-y-1 text-sm" data-testid="student-widget-results">
                  {d.data.results.map((r) => <li key={r.test.id} className="flex justify-between gap-2"><Link href={`/student/results/${r.test.id}`} className="font-semibold text-indigo-700 hover:underline">{r.test.title}</Link><span className="font-semibold">{scoreText(r.totalMarks, r.maxMarks)}</span></li>)}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </Widget>
  );
}
