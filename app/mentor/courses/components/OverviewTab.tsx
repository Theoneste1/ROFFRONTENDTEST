'use client';

/**
 * Course analytics for one course × division (`GET /analytics/courses/:id`).
 * Keeps the original Overview and Reports sub-tabs. The Students, Grades,
 * Activity and Outcomes sub-tabs were removed: the backend has no per-student
 * mentor data (gap B1) and the last two were placeholders.
 */
import React, { useMemo, useState } from 'react';
import { Users, Award, Calendar, FileText, Folder, ChevronRight, ChevronDown, BarChart3, User } from 'lucide-react';
import type { TeachingScope } from '@/lib/api/types';
import { useCourseAnalytics, useDivisionTop, useMentorAssignments, useMentorResources } from '@/lib/queries/mentor';
import { useSession } from '@/lib/auth/session';
import { useNow } from '@/lib/hooks/useNow';
import { formatDate, formatNumber, personName } from '@/lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '@/app/components/ui/feedback';
import { REVIEW_STATUS } from '../../components/mentorUi';
import type { ResourceKind } from './ResourcesTab';

const StatCard = ({ title, value, subtext }: { title: string; value: string; subtext: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-2">
    <span className="text-sm font-medium text-slate-500">{title}</span>
    <div className="text-3xl font-extrabold text-blue-600 tracking-tight">{value}</div>
    <div className="text-xs text-slate-400">{subtext}</div>
  </div>
);

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

export default function OverviewTab({ scope, onOpenTab }: { scope: TeachingScope; onOpenTab: (t: ResourceKind) => void }) {
  const [activeSubTab, setActiveSubTab] = useState<'Overview' | 'Reports'>('Overview');
  const analytics = useCourseAnalytics(scope.course.id, scope.division.id);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-900">Course Analytics</h2>
      <div className="border-b border-gray-300">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {(['Overview', 'Reports'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveSubTab(tab)}
              className={`py-3 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeSubTab === tab ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {analytics.isPending ? (
        <LoadingBlock label="Loading course analytics…" />
      ) : analytics.isError ? (
        <ErrorState error={analytics.error} title="Couldn't load course analytics" onRetry={() => analytics.refetch()} />
      ) : activeSubTab === 'Overview' ? (
        <OverviewPanel scope={scope} data={analytics.data} onOpenTab={onOpenTab} />
      ) : (
        <ReportsPanel scope={scope} data={analytics.data} />
      )}
    </div>
  );
}

type Analytics = NonNullable<ReturnType<typeof useCourseAnalytics>['data']>;

function OverviewPanel({ scope, data, onOpenTab }: { scope: TeachingScope; data: Analytics; onOpenTab: (t: ResourceKind) => void }) {
  const { user } = useSession();
  const now = useNow();
  const resources = useMentorResources(scope.course.id, scope.division.id);
  const assignments = useMentorAssignments({ courseId: scope.course.id, divisionId: scope.division.id, limit: 50 });

  const counts = useMemo(() => {
    const list = resources.data ?? [];
    const c = (types: string[]) => list.filter((r) => types.includes(r.type)).length;
    return { books: c(['BOOK', 'EBOOK']), papers: c(['PAST_PAPER']), notes: c(['NOTE', 'ATTACHMENT']) };
  }, [resources.data]);

  const upcoming = (assignments.data?.data ?? [])
    .filter((a) => a.status === 'PUBLISHED' && new Date(a.deadline).getTime() > now)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 4);
  const pipeline = Object.entries(data.reviewPipeline).filter(([, n]) => (n ?? 0) > 0);
  const completion = Math.round(data.students.completionRate);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-6 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <h3 className="text-base font-bold text-gray-900 mb-4">Course Progress</h3>
            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(completion, 100)}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-600">{completion}%</span>
              </div>
              <p className="text-xs text-gray-400 font-medium">
                {data.students.completed} of {data.students.total} students completed · {data.students.rolled} in progress · {data.students.unrolled} not started
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 mb-4">Key Information</h3>
            <div className="space-y-4">
              <InfoRow icon={<User className="w-4 h-4" />} label="Coach" value={personName(user)} />
              <InfoRow icon={<Users className="w-4 h-4" />} label="Students" value={formatNumber(data.students.total)} />
              <InfoRow icon={<Award className="w-4 h-4" />} label="Division" value={`${scope.division.name} division`} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-6">Assignments</h3>
          {data.assignments.length === 0 ? (
            <p className="text-sm text-gray-500">No published assignments in this course yet.</p>
          ) : (
            <div className="space-y-4">
              {data.assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">{a.title}</p>
                    <p className="text-[11px] text-gray-400">
                      Due {formatDate(a.deadline)} · {a.submissions} submissions ({pct(a.submissionRate)}) · {a.publishedResults} results published
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">avg {pct(a.averagePercentage)}</span>
                </div>
              ))}
            </div>
          )}
          {pipeline.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">Review pipeline (all coaches)</p>
              <div className="flex flex-wrap gap-2">
                {pipeline.map(([status, n]) => (
                  <span key={status} className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full">
                    {REVIEW_STATUS[status as keyof typeof REVIEW_STATUS]?.label ?? status}: {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 space-y-6 min-w-0">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-6">Upcoming</h3>
          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming deadlines.</p>
          ) : (
            <div className="space-y-5">
              {upcoming.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-800">Assignment</p>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{a.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Due {formatDate(a.deadline)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-base font-bold text-gray-900 mb-6">Course Resources</h3>
          <div className="space-y-4">
            <ResourceLink icon={<Folder className="w-4 h-4" />} label="Books" count={counts.books} onClick={() => onOpenTab('books')} />
            <ResourceLink icon={<FileText className="w-4 h-4" />} label="Past Papers" count={counts.papers} onClick={() => onOpenTab('papers')} />
            <ResourceLink icon={<FileText className="w-4 h-4" />} label="Notes & Materials" count={counts.notes} onClick={() => onOpenTab('notes')} />
          </div>
          <p className="mt-4 text-[11px] text-gray-400">
            {data.resources.published} published · {data.resources.totalViews} views by {data.resources.uniqueViewers} students
          </p>
        </div>
      </div>
    </div>
  );
}

function ReportsPanel({ scope, data }: { scope: TeachingScope; data: Analytics }) {
  const [selected, setSelected] = useState('all');
  const top = useDivisionTop(scope.division.id, 5);
  const list = data.assignments;
  const chosen = selected === 'all' ? list : list.filter((a) => a.id === selected);

  const withAvg = chosen.filter((a) => a.averagePercentage !== null);
  const avg = withAvg.length ? withAvg.reduce((s, a) => s + (a.averagePercentage ?? 0), 0) / withAvg.length : null;
  const subRate = chosen.length ? chosen.reduce((s, a) => s + a.submissionRate, 0) / chosen.length : null;
  const published = chosen.reduce((s, a) => s + a.publishedResults, 0);
  const submissions = chosen.reduce((s, a) => s + a.submissions, 0);

  const buckets = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of chosen) for (const d of a.distribution) map.set(d.range, (map.get(d.range) ?? 0) + d.count);
    return [...map.entries()].map(([label, count]) => ({ label, count }));
  }, [chosen]);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  if (list.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80">
        <EmptyState title="No report data yet" description="Reports appear once assignments in this course are published." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">Results and participation for {scope.course.title} · {scope.division.name} division.</p>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1">Assignment</span>
        <div className="relative w-fit">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Assignments</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Average Score" value={pct(avg)} subtext="Across published results" />
        <StatCard title="Submission Rate" value={pct(subRate)} subtext={`${submissions} submissions · ${data.students.total} students`} />
        <StatCard title="Published Results" value={formatNumber(published)} subtext={`of ${submissions} submissions`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <h3 className="text-base font-bold tracking-wide text-slate-800 uppercase mb-6 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Score Distribution
          </h3>
          {buckets.every((b) => b.count === 0) ? (
            <p className="text-sm text-slate-500">No published scores yet.</p>
          ) : (
            <div className="relative h-56 flex items-end justify-between gap-3 px-2 border-b border-slate-200">
              {buckets.map((b) => (
                <div key={b.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-xs font-semibold text-slate-600">{b.count}</span>
                  <div className="w-8 bg-gradient-to-t from-blue-600 to-blue-500 rounded-t-md" style={{ height: `${(b.count / maxCount) * 85}%`, minHeight: b.count ? 4 : 0 }} title={`${b.label}%: ${b.count}`} />
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between gap-3 px-2 pt-3 text-xs font-semibold text-slate-400">
            {buckets.map((b) => (
              <span key={b.label} className="flex-1 text-center">
                {b.label}%
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <h3 className="text-sm font-bold tracking-wider text-slate-800 uppercase">Top Students ({scope.division.name})</h3>
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Points</span>
          </div>
          {top.isPending ? (
            <p className="py-4 text-xs text-slate-400">Loading…</p>
          ) : top.isError || !top.data?.data.length ? (
            <p className="py-4 text-xs text-slate-500">No rankings yet.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {top.data.data.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3.5 text-sm">
                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-semibold text-slate-400 w-4">{s.rank}.</span>
                    <span className="font-semibold text-slate-800">{s.displayName}</span>
                  </div>
                  <span className="font-bold text-slate-800">{formatNumber(s.points)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="pt-4 border-t border-slate-100 text-xs text-slate-400">Division leaderboard (all courses).</p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-xs font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function ResourceLink({ icon, label, count, onClick }: { icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-gray-50 transition-colors text-left">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">{icon}</div>
        <div>
          <p className="text-xs font-bold text-gray-800">{label}</p>
          <p className="text-xs text-gray-400">
            {count} resource{count === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}
