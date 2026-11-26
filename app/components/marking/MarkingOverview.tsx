"use client";

/**
 * The marking overview (owner-approved designs 4 and 5, 2026-11-26), one component for two audiences:
 *  - "headCoach" (/mentor/marking-overview): what waits for the Head Coach, every paper by status, marking progress per
 *    test, the outstanding marking and the coaches' workload — for the subjects they head.
 *  - "admin" (/admin/marking-overview): papers, marking progress, approvals across every subject, a table by subject,
 *    the recent tests (with "Publish results" when ready) and the coaches' workload.
 * Every number is from GET /admin/test-dashboard (tests.view; the backend scopes a Head Coach to the subjects they head);
 * the sums are in lib/test-management/marking-overview.ts. Nothing is shown that the API does not provide.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, ListChecks } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { testResultsApi, type StaffDashboard } from "@/lib/api/test-results";
import type { SubmissionStatus } from "@/lib/api/test-submissions";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { formatDate, formatDateTime, personName } from "@/lib/format";
import { TESTS_VIEW_RESULTS, resultsTabVisible, testPageOf } from "@/lib/test-management/results";
import { SUBMISSION_STATUS, TONE_CLASS, TONE_DOT, type MarkingStatusView, type MarkingTone } from "@/lib/test-management/marking-status";
import {
  STATUS_ORDER, coachProgressTone, countOf, filterCoaches, initials, listText, markedCount, overviewTotals, percent, recentTestState,
  statusSegments, topTestBy, type OverviewTotals, type RecentTestState,
} from "@/lib/test-management/marking-overview";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { FilterBar } from "@/app/components/ui/FilterBar";
import { Card, SearchInput, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { MarkingStatusBadge } from "./MarkingStatusBadge";
import { ProgressBar, StatTile } from "./StatTile";

export type MarkingOverviewAudience = "headCoach" | "admin";

type Dashboard = StaffDashboard;
type DashTest = Dashboard["tests"][number];
type CoachRow = Dashboard["coaches"][number];

const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] focus-visible:ring-offset-2";
const openBtn = `${btnSecondary} ${focusRing}`;

/** The stacked bar's colour per status (the tones of marking-status.ts; two shades where two statuses share a tone). */
const SEGMENT: Record<SubmissionStatus, string> = {
  SUBMITTED: TONE_DOT.neutral, ASSIGNED: "bg-slate-300", MARKING_IN_PROGRESS: TONE_DOT.blue, MARKED: TONE_DOT.amber,
  RETURNED: TONE_DOT.red, AWAITING_SECOND_MARKING: TONE_DOT.indigo, APPROVED: TONE_DOT.green, PUBLISHED: "bg-emerald-800",
};

export default function MarkingOverview({ audience }: { audience: MarkingOverviewAudience }) {
  const portal = audience === "admin" ? "admin" : "mentor";
  const d = useQuery({ queryKey: queryKeys.tests.dashboard("staff"), queryFn: testResultsApi.dashboard });
  const { can, permissionsStatus } = useSession();
  const { detection } = useBackendCapabilities();
  const showReports = resultsTabVisible(detection, permissionsStatus === "ready" && can(TESTS_VIEW_RESULTS));

  const subjectNames = d.data?.subjects.map((s) => s.subject.name) ?? [];
  const description = audience === "headCoach"
    ? (d.data ? (subjectNames.length ? `${listText(subjectNames)}: the subjects you head.` : "You do not head a subject yet.") : "The subjects you head.")
    : "Every subject: the status of every paper, the Head Coaches and markers of each subject, and the coaches' workload.";

  const actions = audience === "admin" ? (
    <>
      {showReports && (
        <Link href="/admin/test-reports" className={`${btnSecondary} ${focusRing}`} data-testid="mo-test-reports">
          <BarChart3 className="h-4 w-4" aria-hidden="true" /> Test results reports
        </Link>
      )}
      <Link href="/admin/tests" className={`${btnPrimary} ${focusRing}`} data-testid="mo-all-tests">
        <ListChecks className="h-4 w-4" aria-hidden="true" /> All tests
      </Link>
    </>
  ) : undefined;

  return (
    <PageFrame title="Marking overview" description={description} actions={actions}>
      <div data-testid={`marking-overview-${audience}`}>
        {d.isPending ? <LoadingBlock label="Loading the marking overview…" /> : d.isError ? (
          <ErrorState error={d.error} title="Couldn't load the marking overview" onRetry={() => d.refetch()} />
        ) : (
          <Body data={d.data} audience={audience} portal={portal} />
        )}
      </div>
    </PageFrame>
  );
}

function Body({ data, audience, portal }: { data: Dashboard; audience: MarkingOverviewAudience; portal: "admin" | "mentor" }) {
  const totals = overviewTotals(data.subjects);
  if (data.tests.length === 0 && totals.papers === 0) {
    return (
      <Card>
        <EmptyState
          title="No tests yet"
          description={audience === "headCoach" ? "When the subjects you head have tests with answers, their marking shows here." : "When tests have answers, their marking shows here."}
          action={<Link href={`/${portal}/tests`} className={openBtn}>Go to tests</Link>}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-600" data-testid="mo-as-of">Figures as of {formatDateTime(data.now)}.</p>
      {audience === "headCoach" ? <HeadCoachView data={data} totals={totals} /> : <AdminView data={data} totals={totals} />}
    </div>
  );
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function Section({ eyebrow, title, caption, trailing, children, testId }: { eyebrow?: string; title: string; caption?: ReactNode; trailing?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <section aria-label={title} data-testid={testId}>
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 pb-3 sm:px-6">
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{eyebrow}</p>}
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {caption && <p className="mt-0.5 text-xs text-gray-500">{caption}</p>}
          </div>
          {trailing}
        </div>
        {children}
      </section>
    </Card>
  );
}

/** A table that scrolls inside its card (never the page). */
function ScrollTable({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="relative overflow-x-auto" data-testid={testId}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

/** A count in a small tinted pill with a dot and words (never colour alone); a dash when zero. */
function CountPill({ n, tone, label, testId }: { n: number; tone: MarkingTone; label?: string; testId?: string }) {
  if (n <= 0) return <span className="text-gray-400" data-testid={testId} data-count={0}>—<span className="sr-only">none</span></span>;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASS[tone]}`} data-testid={testId} data-count={n}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      {n}{label ? ` ${label}` : ""}
    </span>
  );
}

function Avatar({ coach }: { coach: CoachRow["coach"] }) {
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00428C] text-[11px] font-bold text-white" aria-hidden="true">
      {initials(coach)}
    </span>
  );
}

function testWhen(t: DashTest, now: string): string {
  return `${new Date(t.closesAt) <= new Date(now) ? "closed" : "closes"} ${formatDate(t.closesAt)}`;
}

/** A thin bar without text (the tile's hint states the numbers). */
function Meter({ pct }: { pct: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
      <div className="h-full rounded-full bg-[#00428C] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Head Coach (design 4) ─────────────────────────────────────────────────────

function HeadCoachView({ data, totals }: { data: Dashboard; totals: OverviewTotals }) {
  const review = topTestBy(data.tests, "MARKED");
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          emphasis label="Awaiting your review" value={totals.pendingReview} testId="mo-awaiting-review"
          hint={totals.pendingReview === 0 ? "Nothing waits for your review." : review ? `Most in ${review.title}` : "Papers marked by coaches"}
          action={totals.pendingReview > 0 ? (review ? { href: testPageOf("mentor", review.id, "review"), label: "Review now" } : { href: "/mentor/tests", label: "Open tests" }) : undefined}
        />
        <StatTile label="Returned for correction" value={totals.returned} hint="with coaches" tone={totals.returned > 0 ? "red" : "neutral"} testId="mo-returned" />
        <StatTile label="Second markings" value={totals.secondMarking} hint="in progress" tone="indigo" testId="mo-second" />
        <StatTile label="Ready to publish" value={totals.readyToPublish} hint="approved results" tone="green" testId="mo-ready" />
      </div>
      <AllPapers totals={totals} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><TestProgress data={data} /></div>
        <Outstanding data={data} totals={totals} />
      </div>
      <CoachWorkload rows={data.coaches} />
    </>
  );
}

function AllPapers({ totals }: { totals: OverviewTotals }) {
  const segments = statusSegments(totals.byStatus);
  const summary = segments.length
    ? `All ${totals.papers} papers by status: ${segments.map((s) => `${SUBMISSION_STATUS[s.status].label} ${s.count}`).join(", ")}.`
    : "No papers yet.";
  return (
    <Card className="min-w-0 p-4 sm:p-6">
      <section aria-labelledby="mo-all-papers" data-testid="mo-all-papers">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p id="mo-all-papers" className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            All papers · <span data-testid="mo-papers-total">{totals.papers}</span>
          </p>
          <span className="text-xs text-gray-500">by status</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200" role="img" aria-label={summary} data-testid="mo-status-bar">
          {segments.map((s) => (
            <div key={s.status} className={`h-full ${SEGMENT[s.status]}`} style={{ width: `${s.width}%` }} title={`${SUBMISSION_STATUS[s.status].label}: ${s.count}`} />
          ))}
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {STATUS_ORDER.map((st) => {
            const v = SUBMISSION_STATUS[st];
            return (
              <li key={st} className={`rounded-lg px-3 py-2 ring-1 ring-inset ${TONE_CLASS[v.tone]}`} title={v.hint} data-testid={`mo-status-${st}`} data-count={totals.byStatus[st]}>
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SEGMENT[st]}`} aria-hidden="true" />
                  {st === "AWAITING_SECOND_MARKING" ? "Second marking" : st === "RETURNED" ? "Returned" : v.label}
                </span>
                <span className="mt-0.5 block text-xl font-bold tabular-nums">{totals.byStatus[st]}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </Card>
  );
}

function TestProgress({ data }: { data: Dashboard }) {
  return (
    <Section eyebrow="Tests" title="Marking progress per test" caption="The 10 most recent tests (by closing date)" testId="mo-tests">
      <ScrollTable>
        <thead className="bg-gray-50/60">
          <tr>
            <th scope="col" className={th}>Test</th>
            <th scope="col" className={th}>Papers</th>
            <th scope="col" className={`${th} min-w-44`}>Approved</th>
            <th scope="col" className={th}>To review</th>
            <th scope="col" className={th}>Not assigned</th>
            <th scope="col" className={th}><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.tests.length === 0 && (
            <tr><td colSpan={6} className="px-6 py-10 text-center text-xs text-gray-500">No tests yet.</td></tr>
          )}
          {data.tests.map((t) => (
            <tr key={t.id} data-testid={`mo-test-${t.id}`}>
              <td className={`${td} min-w-48`}>
                <p className="font-semibold text-gray-900">{t.title}</p>
                <p className="text-xs text-gray-500">{t.subject.name} · {testWhen(t, data.now)}</p>
              </td>
              <td className={`${td} tabular-nums`} data-testid="mo-test-papers">{t.counts.total}</td>
              <td className={td}><ProgressBar value={t.counts.approved + t.counts.published} total={t.counts.total} /></td>
              <td className={td}><CountPill n={countOf(t.counts, "MARKED")} tone="amber" label="waiting" testId="mo-test-waiting" /></td>
              <td className={td}><CountPill n={countOf(t.counts, "SUBMITTED")} tone="neutral" label={countOf(t.counts, "SUBMITTED") === 1 ? "paper" : "papers"} testId="mo-test-unassigned" /></td>
              <td className={`${td} text-right`}>
                <Link href={testPageOf("mentor", t.id)} className={openBtn} aria-label={`Open ${t.title}`}>Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </ScrollTable>
    </Section>
  );
}

function Outstanding({ data, totals }: { data: Dashboard; totals: OverviewTotals }) {
  const items: Array<{ key: string; n: number; tone: MarkingTone; title: string; status: SubmissionStatus; tab?: string; note: string }> = [
    { key: "review", n: totals.pendingReview, tone: "amber", status: "MARKED", tab: "review", title: `${totals.pendingReview} ${totals.pendingReview === 1 ? "paper" : "papers"} awaiting your review`, note: "approve or return them" },
    { key: "returned", n: totals.returned, tone: "red", status: "RETURNED", tab: "review", title: `${totals.returned} ${totals.returned === 1 ? "paper" : "papers"} returned to coaches`, note: "waiting for corrections" },
    { key: "unassigned", n: totals.byStatus.SUBMITTED, tone: "neutral", status: "SUBMITTED", tab: "markers", title: `${totals.byStatus.SUBMITTED} ${totals.byStatus.SUBMITTED === 1 ? "paper" : "papers"} not assigned`, note: "distribute them to markers" },
    { key: "second", n: totals.secondMarking, tone: "indigo", status: "AWAITING_SECOND_MARKING", tab: "review", title: `${totals.secondMarking} second ${totals.secondMarking === 1 ? "marking" : "markings"} in progress`, note: "marked independently by a second coach" },
  ];
  const shown = items.filter((i) => i.n > 0);
  return (
    <Section eyebrow="Needs attention" title="Outstanding marking" testId="mo-outstanding">
      <div className="px-4 pb-5 sm:px-6">
        {shown.length === 0 ? (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Nothing outstanding: every paper is marked and reviewed.</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((i) => {
              const test = topTestBy(data.tests, i.status);
              const href = test ? testPageOf("mentor", test.id, i.tab) : "/mentor/tests";
              return (
                <li key={i.key} className={`rounded-xl px-4 py-3 ring-1 ring-inset ${TONE_CLASS[i.tone]}`} data-testid={`mo-outstanding-${i.key}`} data-count={i.n}>
                  <p className="font-semibold">{i.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="opacity-90">{test ? `${test.title} · ${i.note}` : i.note}</span>
                    <Link href={href} className={`inline-flex min-h-8 items-center gap-1 rounded font-semibold underline-offset-2 hover:underline ${focusRing}`}
                      aria-label={test ? `Open ${test.title}` : "Open the tests"}>
                      Open <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}

type CoachShow = "" | "returned" | "notStarted" | "done";
const COACH_SHOW: Array<{ label: string; value: CoachShow }> = [
  { label: "With returned papers", value: "returned" },
  { label: "With papers not started", value: "notStarted" },
  { label: "Everything marked", value: "done" },
];

function CoachWorkload({ rows }: { rows: CoachRow[] }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<CoachShow>("");
  const shown = filterCoaches(rows, q).filter((r) =>
    show === "returned" ? r.returned > 0 : show === "notStarted" ? r.notStarted > 0 : show === "done" ? r.assigned > 0 && r.marked >= r.assigned : true);
  return (
    <Section
      eyebrow="Coaches" title="Coach workload & progress" testId="mo-coaches"
      caption="Up to 20 coaches, those with the most unfinished marking first. In progress includes returned markings."
    >
      <div className="px-4 pb-3 sm:px-6">
        <FilterBar
          testId="mo-coach-filters"
          search={<SearchInput value={q} onChange={setQ} placeholder="Search a coach…" label="Search a coach" delay={150} />}
          filters={[{ key: "show", kind: "select", label: "Show", value: show, onChange: (v) => setShow(v as CoachShow), options: COACH_SHOW }]}
          onClearAll={() => { setShow(""); setQ(""); }}
        />
      </div>
      <ScrollTable testId="mo-coach-table">
        <thead className="bg-gray-50/60">
          <tr>
            <th scope="col" className={th}>Coach</th>
            <th scope="col" className={th}>Assigned</th>
            <th scope="col" className={th}>Not started</th>
            <th scope="col" className={th}>In progress</th>
            <th scope="col" className={th}>Submitted</th>
            <th scope="col" className={th}>Returned</th>
            <th scope="col" className={`${th} min-w-48`}>Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {shown.length === 0 && (
            <tr><td colSpan={7} className="px-6 py-10 text-center text-xs text-gray-500">{rows.length === 0 ? "No papers are assigned to coaches yet." : "No coach matches."}</td></tr>
          )}
          {shown.map((r) => (
            <tr key={r.coach.id} data-testid={`mo-coach-${r.coach.id}`}>
              <td className={td}>
                <span className="flex items-center gap-3 whitespace-nowrap font-medium text-gray-900"><Avatar coach={r.coach} />{personName(r.coach)}</span>
              </td>
              <td className={`${td} tabular-nums`} data-testid="mo-coach-assigned">{r.assigned}</td>
              <td className={`${td} tabular-nums`}>{r.notStarted}</td>
              <td className={`${td} tabular-nums text-blue-800`}>{r.inProgress}</td>
              <td className={`${td} tabular-nums font-semibold text-indigo-800`} data-testid="mo-coach-marked">{r.marked}</td>
              <td className={td}><CountPill n={r.returned} tone="red" /></td>
              <td className={td}><CoachProgress marked={r.marked} assigned={r.assigned} /></td>
            </tr>
          ))}
        </tbody>
      </ScrollTable>
    </Section>
  );
}

function CoachProgress({ marked, assigned }: { marked: number; assigned: number }) {
  const pct = percent(marked, assigned);
  const fill = { amber: "bg-amber-500", green: "bg-emerald-600", blue: "bg-[#00428C]" }[coachProgressTone(marked, assigned)];
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${marked} of ${assigned} marked (${pct}%)`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${fill} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-600">{pct}%</span>
    </div>
  );
}

// ── Administrator (design 5) ──────────────────────────────────────────────────

function AdminView({ data, totals }: { data: Dashboard; totals: OverviewTotals }) {
  const pct = percent(totals.marked, totals.papers);
  const n = data.subjects.length;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Papers submitted" value={totals.papers} hint={`${n} ${n === 1 ? "subject" : "subjects"}`} testId="mo-papers" />
        <StatTile label="Marking progress" value={`${pct}%`} hint={`${totals.marked} of ${totals.papers} marked`} testId="mo-progress">
          <Meter pct={pct} />
        </StatTile>
        <StatTile label="Awaiting review" value={totals.pendingReview} hint="with Head Coaches" tone="amber" testId="mo-awaiting-review" />
        <StatTile label="Approved" value={totals.approved} hint="locked marks (incl. published)" tone="green" testId="mo-approved" />
        <StatTile emphasis label="Ready to publish" value={totals.readyToPublish} hint="approved, not published" testId="mo-ready" />
      </div>
      <BySubject data={data} />
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-5">
        <div className="min-w-0 2xl:col-span-3"><RecentTests data={data} /></div>
        <div className="min-w-0 2xl:col-span-2"><AdminCoaches rows={data.coaches} /></div>
      </div>
    </>
  );
}

function BySubject({ data }: { data: Dashboard }) {
  return (
    <Section title="By subject" caption="Status of every paper, the Head Coaches and the authorised markers of each subject." testId="mo-subjects">
      <ScrollTable>
        <thead className="bg-gray-50/60">
          <tr>
            <th scope="col" className={th}>Subject</th>
            <th scope="col" className={th}>Head Coaches</th>
            <th scope="col" className={th}>Markers</th>
            <th scope="col" className={th}>Tests</th>
            <th scope="col" className={`${th} min-w-40`}>Marked</th>
            <th scope="col" className={th}>Awaiting review</th>
            <th scope="col" className={th}>Returned</th>
            <th scope="col" className={th}>Ready</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.subjects.length === 0 && (
            <tr><td colSpan={8} className="px-6 py-10 text-center text-xs text-gray-500">No active subjects.</td></tr>
          )}
          {data.subjects.map((s) => (
            <tr key={s.subject.id} data-testid={`mo-subject-${s.subject.code}`}>
              <td className={`${td} whitespace-nowrap font-semibold text-gray-900`}>{s.subject.name}</td>
              <td className={`${td} whitespace-nowrap`}>{s.headCoaches === 0 ? <span className="text-amber-800">None</span> : `${s.headCoaches} ${s.headCoaches === 1 ? "Head Coach" : "Head Coaches"}`}</td>
              <td className={`${td} tabular-nums`}>{s.authorisedMarkers}</td>
              <td className={`${td} whitespace-nowrap`}>{s.tests.published} published{s.tests.draft > 0 ? ` · ${s.tests.draft} draft` : ""}</td>
              <td className={td}><ProgressBar value={markedCount(s.submissions)} total={s.submissions.total} /></td>
              <td className={td}><CountPill n={s.pendingReview} tone="amber" testId="mo-subject-review" /></td>
              <td className={td}><CountPill n={s.returned} tone="red" testId="mo-subject-returned" /></td>
              <td className={td}><CountPill n={s.readyToPublish} tone="green" testId="mo-subject-ready" /></td>
            </tr>
          ))}
        </tbody>
      </ScrollTable>
    </Section>
  );
}

const RECENT: Record<RecentTestState, MarkingStatusView> = {
  none: { label: "No papers", tone: "neutral", icon: "notStarted", hint: "No answers have been submitted for this test." },
  marking: { label: "In marking", tone: "blue", icon: "inProgress", hint: "Some papers are not approved yet." },
  ready: { label: "Ready to publish", tone: "green", icon: "approved", hint: "Every paper is approved; the results can be published." },
  published: { label: "Published", tone: "green", icon: "published", hint: "Every result is published to the students." },
};

function RecentTests({ data }: { data: Dashboard }) {
  return (
    <Section title="Recent tests" caption="The 10 most recent tests (by closing date)" testId="mo-recent">
      <ScrollTable>
        <thead className="bg-gray-50/60">
          <tr>
            <th scope="col" className={th}>Test</th>
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={`${th} min-w-44`}>Approved / published</th>
            <th scope="col" className={th}><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.tests.length === 0 && (
            <tr><td colSpan={4} className="px-6 py-10 text-center text-xs text-gray-500">No tests yet.</td></tr>
          )}
          {data.tests.map((t) => {
            const state = recentTestState(t.counts);
            return (
              <tr key={t.id} data-testid={`mo-test-${t.id}`} data-state={state}>
                <td className={`${td} min-w-44`}>
                  <p className="font-semibold text-gray-900">{t.title}</p>
                  <p className="text-xs text-gray-500">{t.subject.name} · {testWhen(t, data.now)}</p>
                </td>
                <td className={td}><MarkingStatusBadge status={RECENT[state]} testId="mo-test-state" /></td>
                <td className={td}><ProgressBar value={t.counts.approved + t.counts.published} total={t.counts.total} /></td>
                <td className={`${td} text-right`}>
                  {state === "ready" ? (
                    <Link href={testPageOf("admin", t.id, "publishing")} className={`${btnPrimary} whitespace-nowrap ${focusRing}`} aria-label={`Publish the results of ${t.title}`} data-testid="mo-publish">
                      Publish results
                    </Link>
                  ) : (
                    <Link href={testPageOf("admin", t.id)} className={openBtn} aria-label={`Open ${t.title}`}>Open</Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </ScrollTable>
    </Section>
  );
}

function AdminCoaches({ rows }: { rows: CoachRow[] }) {
  return (
    <Section title="Coach workload (top 20)" caption="Those with the most unfinished marking first." testId="mo-coaches">
      <ScrollTable testId="mo-coach-table">
        <thead className="bg-gray-50/60">
          <tr>
            <th scope="col" className={th}>Coach</th>
            <th scope="col" className={th}>Assigned</th>
            <th scope="col" className={`${th} min-w-40`}>Submitted</th>
            <th scope="col" className={th}>Returned</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <tr><td colSpan={4} className="px-6 py-10 text-center text-xs text-gray-500">No papers are assigned to coaches yet.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.coach.id} data-testid={`mo-coach-${r.coach.id}`}>
              <td className={`${td} font-medium text-gray-900`}>{personName(r.coach)}</td>
              <td className={`${td} tabular-nums`} data-testid="mo-coach-assigned">{r.assigned}</td>
              <td className={td} data-testid="mo-coach-marked" data-count={r.marked}>
                <ProgressBar value={r.marked} total={r.assigned} tone={coachProgressTone(r.marked, r.assigned)} />
              </td>
              <td className={td}><CountPill n={r.returned} tone="red" /></td>
            </tr>
          ))}
        </tbody>
      </ScrollTable>
    </Section>
  );
}
