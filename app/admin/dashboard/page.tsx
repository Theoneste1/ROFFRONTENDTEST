'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useSession } from '@/lib/auth/session';
import { useAdminDashboard, useAuditLog, useReportsOverview } from '@/lib/queries/admin';
import { useCourses } from '@/lib/queries/learning';
import { useNow } from '@/lib/hooks/useNow';
import { formatNumber, formatRelative } from '@/lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '@/app/components/ui/feedback';
import { MetricCard } from '../components/adminUi';
import { describeAudit } from '../components/auditText';
import type { ReportsOverview } from '@/lib/api/types';

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

interface AttentionItemProps {
  title: string;
  description: string;
  href?: string;
}

function AttentionItem({ title, description, href }: AttentionItemProps) {
  const body = (
    <>
      <div>
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      {href && <ArrowRight className="w-4 h-4 text-indigo-600 transition-transform group-hover:translate-x-1 shrink-0 ml-3" aria-hidden="true" />}
    </>
  );
  const cls = 'group bg-white border border-gray-200/80 rounded-xl p-4 flex items-center justify-between transition-all shadow-2xs';
  return href ? (
    <Link href={href} className={`${cls} hover:border-gray-300`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Items from `GET /admin/reports/overview` → `actionRequired`; only non-zero ones are shown. */
function attentionItems(a: ReportsOverview['actionRequired']): AttentionItemProps[] {
  const items: (AttentionItemProps & { count: number })[] = [
    {
      count: a.assignmentsAwaitingApproval,
      title: 'Assignments awaiting approval',
      description: `${plural(a.assignmentsAwaitingApproval, 'assignment')} submitted by coaches to publish or return.`,
      href: '/admin/assignments?status=PENDING_APPROVAL',
    },
    {
      count: a.submissionsToDistribute,
      title: 'Submissions to distribute',
      description: `${plural(a.submissionsToDistribute, 'submission')} not yet assigned to a coach.`,
      href: '/admin/assignments?status=PUBLISHED',
    },
    {
      count: a.reviewsAwaitingApproval,
      title: 'Reviews awaiting approval',
      description: `${plural(a.reviewsAwaitingApproval, 'review')} sent by coaches for approval.`,
      href: '/admin/results',
    },
    {
      count: a.resultsReadyToPublish,
      title: 'Results ready to publish',
      description: `${plural(a.resultsReadyToPublish, 'approved result')} not yet released to students.`,
      href: '/admin/results',
    },
    {
      count: a.mentorApplications,
      title: 'Coach applications',
      description: `${plural(a.mentorApplications, 'application')} waiting for a decision.`,
      href: '/admin/mentors?tab=applications',
    },
    {
      count: a.studentsAwaitingApproval,
      title: 'Students awaiting approval',
      description: `${plural(a.studentsAwaitingApproval, 'student account')} to approve.`,
      href: '/admin/users?status=awaiting-approval',
    },
    {
      count: a.failedEmails,
      title: 'Failed e-mails',
      description: `${plural(a.failedEmails, 'e-mail')} could not be delivered.`,
    },
  ];
  return items.filter((i) => i.count > 0);
}

export default function DashboardMain() {
  const { user } = useSession();
  const now = useNow();
  const dashboard = useAdminDashboard();
  const overview = useReportsOverview();
  const activity = useAuditLog({ limit: 6 });
  const courses = useCourses();

  const d = dashboard.data;
  const junior = d?.students.byDivision.find((x) => x.code === 'JUNIOR');
  const senior = d?.students.byDivision.find((x) => x.code === 'SENIOR');
  const publishedCourses = courses.data?.filter((c) => c.status === 'PUBLISHED').length;

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 font-sans text-gray-800">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          {greeting(now)}, {user?.firstName ?? 'Admin'}
        </h1>
        <p className="text-sm text-gray-500 mt-1 font-normal">
          Platform overview — manage users, curriculum, assignments and the results workflow.
        </p>
      </div>

      {/* Metric Cards Row */}
      {dashboard.isPending ? (
        <LoadingBlock label="Loading platform figures…" />
      ) : dashboard.isError ? (
        <div className="mb-8">
          <ErrorState error={dashboard.error} title="Couldn't load the dashboard" onRetry={() => dashboard.refetch()} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <MetricCard label="Total students" value={formatNumber(d!.students.total)} subtext={`${formatNumber(d!.students.active)} active · ${formatNumber(d!.students.awaitingSetup)} awaiting setup`} />
          <MetricCard label="Total coaches" value={formatNumber(d!.mentors.total)} subtext={`${formatNumber(d!.mentors.active)} active · ${formatNumber(d!.mentors.awaitingSetup)} awaiting setup`} />
          <MetricCard label="Junior students" value={formatNumber(junior?.students ?? 0)} subtext="S1–S3" />
          <MetricCard label="Senior students" value={formatNumber(senior?.students ?? 0)} subtext="S4–S6" />
          <MetricCard
            label="Published courses"
            value={courses.isPending ? '…' : courses.isError ? '—' : formatNumber(publishedCourses ?? 0)}
            subtext={courses.data ? `of ${courses.data.length} · Mathematics` : 'Mathematics'}
          />
        </div>
      )}

      {/* Main Content Sections: Needs attention & Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention Card */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100/80" aria-labelledby="attention-title">
          <h2 id="attention-title" className="text-xl font-bold text-gray-900">Needs attention</h2>
          <p className="text-xs text-gray-500 mb-6">What requires action right now.</p>
          {overview.isPending ? (
            <LoadingBlock />
          ) : overview.isError ? (
            <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
          ) : (
            (() => {
              const items = attentionItems(overview.data.actionRequired);
              const reported = d?.reportedContent.open ?? 0;
              if (reported > 0)
                items.push({
                  title: 'Reported discussion content',
                  description: `${plural(reported, 'open report')} to review.`,
                  href: '/admin/moderation',
                });
              return items.length ? (
                <div className="space-y-3">
                  {items.map((item) => (
                    <AttentionItem key={item.title} {...item} />
                  ))}
                </div>
              ) : (
                <EmptyState title="Nothing needs attention" description="No approvals, distributions or publications are waiting." />
              );
            })()
          )}
          {d && d.reviews.pendingMentorReview > 0 && (
            <p className="text-xs text-gray-400 mt-4">{plural(d.reviews.pendingMentorReview, 'submission is', 'submissions are')} currently with coaches.</p>
          )}
        </section>

        {/* Recent Activity Card */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100/80" aria-labelledby="activity-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="activity-title" className="text-xl font-bold text-gray-900">Recent activity</h2>
              <p className="text-xs text-gray-500 mb-4">Latest events across the platform.</p>
            </div>
            <Link href="/admin/audit-log" className="text-xs font-medium text-indigo-600 hover:text-indigo-800 shrink-0">
              View audit log
            </Link>
          </div>
          {activity.isPending ? (
            <LoadingBlock />
          ) : activity.isError ? (
            <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
          ) : activity.data.data.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {activity.data.data.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-4 py-3 text-xs">
                  <span className="text-gray-700 font-medium min-w-0 break-words">{describeAudit(e)}</span>
                  <time dateTime={e.createdAt} className="text-gray-400 font-medium shrink-0">
                    {formatRelative(e.createdAt, now)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
