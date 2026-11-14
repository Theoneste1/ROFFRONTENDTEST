"use client";

/**
 * Head Coach overview: the dashboard figures of the programmes they head
 * (GET /admin/dashboard, reports.view — the backend leaves out moderation and
 * account-wide sections for a Head Coach) and the last 30 days of activity
 * (GET /admin/activity/summary, activity.view — programme members only).
 */
import { formatNumber } from "@/lib/format";
import { activityBreakdown } from "@/lib/programmes/programme-rules";
import { useActivitySummary, useProgrammeDashboard } from "@/lib/queries/programmes";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Card, MetricCard } from "@/app/admin/components/adminUi";

export default function ProgrammeOverview({ showDashboard, showActivity }: { showDashboard: boolean; showActivity: boolean }) {
  const dash = useProgrammeDashboard(showDashboard);
  const activity = useActivitySummary(showActivity);

  return (
    <div className="space-y-6" data-testid="programme-overview">
      {showDashboard &&
        (dash.isPending ? (
          <LoadingBlock />
        ) : dash.isError ? (
          <ErrorState error={dash.error} title="Couldn't load the programme figures" onRetry={() => dash.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="programme-figures">
              <MetricCard label="Students" value={formatNumber(dash.data.students.total)} subtext={`${formatNumber(dash.data.students.active)} active`} />
              <MetricCard label="Coaches" value={formatNumber(dash.data.mentors.total)} subtext={`${formatNumber(dash.data.mentors.active)} active`} />
              <MetricCard label="Assignments published" value={formatNumber(dash.data.assignments.published)} />
              <MetricCard label="Submissions" value={formatNumber(dash.data.submissions.total)} subtext={`${formatNumber(dash.data.submissions.late)} late`} />
              <MetricCard label="Waiting for a coach's review" value={formatNumber(dash.data.reviews.pendingMentorReview)} />
              <MetricCard label="Reviews completed" value={formatNumber(dash.data.reviews.completed)} />
              <MetricCard label="Results published" value={formatNumber(dash.data.results.published)} />
              <MetricCard label="Results awaiting publication" value={formatNumber(dash.data.results.awaitingPublication)} />
            </div>
            {dash.data.students.byCourse.length > 0 && (
              <Card className="p-6">
                <h2 className="text-sm font-bold text-gray-900 mb-3">Students by course</h2>
                <ul className="divide-y divide-gray-100 text-sm" data-testid="students-by-course">
                  {dash.data.students.byCourse.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-medium text-gray-800">{c.title}</span>
                      <span className="text-xs text-gray-500">
                        {formatNumber(c.participating)} participating · {formatNumber(c.completed)} completed
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ))}

      {showActivity &&
        (activity.isPending ? (
          <LoadingBlock />
        ) : activity.isError ? (
          <ErrorState error={activity.error} title="Couldn't load the activity summary" onRetry={() => activity.refetch()} />
        ) : (
          <Card className="p-6">
            <h2 className="text-sm font-bold text-gray-900 mb-1">Last 30 days</h2>
            <p className="text-xs text-gray-500 mb-4" data-testid="active-users">
              {formatNumber(activity.data.activeUsers)} active {activity.data.activeUsers === 1 ? "member" : "members"}
            </p>
            {activityBreakdown(activity.data.byType).length === 0 ? (
              <p className="text-sm text-gray-500">No activity recorded in this period.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 text-sm">
                {activityBreakdown(activity.data.byType).map((a) => (
                  <li key={a.type} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                    <span className="text-gray-700">{a.label}</span>
                    <span className="font-semibold text-gray-900">{formatNumber(a.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
    </div>
  );
}
