'use client';

/**
 * Mentor dashboard (original layout). The backend has no single dashboard
 * endpoint for mentors, so the figures are composed from:
 * `GET /me/teaching`, `/analytics/courses/:id` per scope, `/assignments`,
 * `/mentor/reviews` and `/notifications`.
 */
import React from 'react';
import Link from 'next/link';
import { Users, FileText, BookOpen, TrendingUp, Clock, CheckCircle2, AlertCircle, Calendar, Award, Activity, ClipboardCheck } from 'lucide-react';
import { useSession } from '@/lib/auth/session';
import { useMentorAssignments, useReviewQueue, useScopesAnalytics, useTeachingScopes } from '@/lib/queries/mentor';
import { useNotifications } from '@/lib/queries/community';
import { useBackendCapabilities } from '@/lib/queries/capabilities';
import { hasFeature } from '@/lib/api/capabilities';
import { NotificationLink } from '@/app/components/notifications/notificationUi';
import { useNow } from '@/lib/hooks/useNow';
import { formatDate, formatRelative } from '@/lib/format';
import { ErrorState, Spinner } from '@/app/components/ui/feedback';
import { OPEN_REVIEW_STATUSES } from '../components/mentorUi';

export default function MentorDashboard() {
  const { user } = useSession();
  const now = useNow();
  const scopes = useTeachingScopes();
  const analytics = useScopesAnalytics(scopes.data);
  const assignments = useMentorAssignments({ limit: 100 });
  // With reviewQueueFilters the totals come from the server (`counts`); otherwise from the first 100 rows (L3).
  const caps = useBackendCapabilities();
  const serverCounts = hasFeature(caps.detection, 'reviewQueueFilters');
  const queue = useReviewQueue(serverCounts ? { group: 'all', limit: 1 } : { limit: 100 }, { enabled: !caps.loading });
  const notifications = useNotifications({ limit: 5 });

  const loadedAnalytics = analytics.map((q) => q.data).filter((d): d is NonNullable<typeof d> => !!d);
  const totalStudents = loadedAnalytics.reduce((s, a) => s + a.students.total, 0);
  const withAvg = loadedAnalytics.flatMap((a) => a.assignments).filter((a) => a.averagePercentage !== null);
  const avgScore = withAvg.length ? Math.round(withAvg.reduce((s, a) => s + (a.averagePercentage ?? 0), 0) / withAvg.length) : null;

  const list = assignments.data?.data ?? [];
  const published = list.filter((a) => a.status === 'PUBLISHED');
  const dueThisWeek = published.filter((a) => {
    const t = new Date(a.deadline).getTime();
    return t > now && t - now < 7 * 86_400_000;
  }).length;
  const drafts = list.filter((a) => a.status === 'DRAFT' || a.status === 'REJECTED').length;
  const pendingApproval = list.filter((a) => a.status === 'PENDING_APPROVAL').length;
  const toReview = queue.data?.counts?.open ?? (queue.data?.data ?? []).filter((s) => OPEN_REVIEW_STATUSES.includes(s.status)).length;

  const loading = scopes.isPending || assignments.isPending || queue.isPending;
  const stats = [
    {
      title: 'Total Students',
      value: scopes.isPending || analytics.some((q) => q.isPending) ? '…' : String(totalStudents),
      change: `In ${scopes.data?.length ?? 0} course × division scope${scopes.data?.length === 1 ? '' : 's'}`,
      icon: <Users className="w-6 h-6" />,
      color: 'bg-blue-500',
    },
    {
      title: 'Active Assignments',
      value: loading ? '…' : String(published.length),
      change: `${dueThisWeek} due this week · ${pendingApproval} awaiting approval`,
      icon: <FileText className="w-6 h-6" />,
      color: 'bg-purple-500',
    },
    {
      title: 'Reviews To Do',
      value: loading ? '…' : String(toReview),
      change: `${queue.data?.counts?.all ?? queue.data?.meta.total ?? 0} assigned to you in total`,
      icon: <ClipboardCheck className="w-6 h-6" />,
      color: 'bg-emerald-500',
    },
    {
      title: 'Avg. Performance',
      value: avgScore === null ? '—' : `${avgScore}%`,
      change: 'Average of published results',
      icon: <TrendingUp className="w-6 h-6" />,
      color: 'bg-amber-500',
    },
  ];

  const upcoming = published
    .filter((a) => new Date(a.deadline).getTime() > now)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 4);

  return (
    <div className="min-h-screen p-4 md:p-10 font-sans text-slate-800 bg-[#E6EBF2]">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome back, {user?.firstName}! Here&apos;s what&apos;s happening in your courses.</p>
        </div>

        {scopes.isError && <ErrorState error={scopes.error} title="Couldn't load your courses" onRetry={() => scopes.refetch()} />}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.title} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-2">{stat.change}</p>
                </div>
                <div className={`${stat.color} text-white p-3 rounded-xl`}>{stat.icon}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent activity = the mentor's notifications */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Recent Activity</h2>
              <Link href="/mentor/notifications" className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                View all <Activity className="w-4 h-4" />
              </Link>
            </div>
            {notifications.isPending ? (
              <Spinner />
            ) : notifications.isError ? (
              <p className="text-sm text-red-600">Couldn&apos;t load recent activity.</p>
            ) : notifications.data.data.length === 0 ? (
              <p className="text-sm text-gray-500">No activity yet. You&apos;ll see assigned work, decisions on your assignments and reviews, and discussion activity here.</p>
            ) : (
              <div className="space-y-4">
                {notifications.data.data.map((n) => {
                  const tone = n.category === 'REVIEWS' ? 'bg-blue-100 text-blue-600' : n.category === 'ASSIGNMENTS' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600';
                  const Icon = n.category === 'REVIEWS' ? FileText : n.category === 'ASSIGNMENTS' ? CheckCircle2 : AlertCircle;
                  return (
                    <NotificationLink key={n.id} notification={n} className="flex items-start gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tone}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                        {n.body && <p className="text-sm text-gray-600 line-clamp-2">{n.body}</p>}
                        <p className="text-xs text-gray-400 mt-1">{formatRelative(n.createdAt, now)}</p>
                      </div>
                    </NotificationLink>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upcoming deadlines */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Upcoming Deadlines</h2>
              <Calendar className="w-5 h-5 text-gray-400" />
            </div>
            {assignments.isPending ? (
              <Spinner />
            ) : upcoming.length === 0 ? (
              <p className="text-sm text-gray-500">No published assignments with an upcoming deadline.{drafts > 0 && ` You have ${drafts} draft(s).`}</p>
            ) : (
              <div className="space-y-4">
                {upcoming.map((a) => (
                  <Link key={a.id} href={`/mentor/assignments/${a.id}`} className="block p-4 rounded-xl border border-gray-200 hover:border-blue-300 transition-colors">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{a.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {a.course.title} · {a.division.name}
                    </p>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(a.deadline)}
                      </div>
                      <span className="text-xs font-semibold text-blue-600">{a._count?.submissions ?? 0} submitted</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/mentor/assignments/create" className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50 transition-colors">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-semibold text-gray-700">Create Assignment</span>
            </Link>
            <Link href="/mentor/courses" className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-purple-500 hover:bg-purple-50 transition-colors">
              <BookOpen className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-semibold text-gray-700">Course Resources</span>
            </Link>
            <Link href="/mentor/reviews" className="flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-500 hover:bg-emerald-50 transition-colors">
              <Award className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-semibold text-gray-700">Grade Submissions{toReview > 0 && ` (${toReview})`}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
