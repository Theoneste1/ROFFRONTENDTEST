"use client";

/**
 * Courses of the programmes a Head Coach heads, with participation per course ×
 * division (GET /admin/reports/course-participation, reports.view — programme
 * courses only, no score aggregates) and, on demand, the course analytics of one
 * course × division (GET /analytics/courses/:id, analytics.course — programme
 * courses only; scores are left out for a Head Coach).
 *
 * Also used on the coach portal's Courses page for a Head Coach who has no course
 * × division assignment of their own (`compact`).
 */
import { useState } from "react";
import { X } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { formatNumber, formatDate } from "@/lib/format";
import { programmeCourses } from "@/lib/programmes/programme-rules";
import { useProgrammeCourseAnalytics, useProgrammeParticipation } from "@/lib/queries/programmes";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Card, MetricCard, TableCard, TableMessage, linkBtn, td, th } from "@/app/admin/components/adminUi";

/** The backend sends null when there is nothing to divide by. */
const pct = (n: number | null) => (n === null || n === undefined ? "—" : `${formatNumber(Math.round(n))}%`);

export default function ProgrammeCourses({ compact = false }: { compact?: boolean }) {
  const { can } = useSession();
  const participation = useProgrammeParticipation(true);
  const [open, setOpen] = useState<{ courseId: string; divisionId: string; label: string } | null>(null);
  const analyticsAllowed = can("analytics.course");

  if (participation.isPending) return <LoadingBlock label="Loading the programme's courses…" />;
  if (participation.isError) return <ErrorState error={participation.error} title="Couldn't load the programme's courses" onRetry={() => participation.refetch()} />;
  const rows = participation.data.rows;

  if (compact) {
    const courses = programmeCourses(rows);
    return (
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="programme-courses">
        {courses.length === 0 && <li className="text-sm text-gray-500">Your programmes have no courses yet.</li>}
        {courses.map((c) => (
          <li key={c.course.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-semibold text-indigo-600">{c.course.code}</p>
            <h3 className="text-base font-bold text-gray-900">{c.course.title}</h3>
            <p className="text-xs text-gray-500 mt-1">
              {formatNumber(c.students)} students · {formatNumber(c.opened)} opened the course · {formatNumber(c.submissions)} submissions
            </p>
            <p className="text-xs text-gray-400 mt-2">{c.divisions.map((d) => d.division.name).join(" · ")}</p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <TableCard>
        <thead className="bg-gray-50/60 border-b border-gray-100">
          <tr>
            <th className={th}>Course</th>
            <th className={th}>Division</th>
            <th className={th}>Students</th>
            <th className={th}>Opened</th>
            <th className={th}>Completed</th>
            <th className={th}>Assignments</th>
            <th className={th}>Submitted</th>
            <th className={th}>Discussion</th>
            {analyticsAllowed && <th className={`${th} text-right`}>Analytics</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50" data-testid="course-participation">
          {rows.length === 0 ? (
            <TableMessage colSpan={analyticsAllowed ? 9 : 8}>No courses in your programmes yet.</TableMessage>
          ) : (
            rows.map((r) => {
              const label = `${r.course.title} · ${r.division.name}`;
              return (
                <tr key={`${r.course.id}:${r.division.id}`}>
                  <td className={`${td} font-semibold text-gray-800`}>{r.course.title}</td>
                  <td className={`${td} text-gray-600`}>{r.division.name}</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(r.students)}</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(r.opened)} ({pct(r.participationRate)})</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(r.completed)}</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(r.assignmentsPublished)}</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(r.studentsSubmitted)} ({pct(r.submissionRate)})</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(r.discussionThreads)} threads · {formatNumber(r.discussionComments)} comments</td>
                  {analyticsAllowed && (
                    <td className={`${td} text-right`}>
                      <button type="button" className={linkBtn} onClick={() => setOpen({ courseId: r.course.id, divisionId: r.division.id, label })} aria-label={`Analytics for ${label}`}>
                        View
                      </button>
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </TableCard>
      {open && <CourseAnalyticsPanel {...open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CourseAnalyticsPanel({ courseId, divisionId, label, onClose }: { courseId: string; divisionId: string; label: string; onClose: () => void }) {
  const a = useProgrammeCourseAnalytics(courseId, divisionId);
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">{label}</h2>
          <p className="text-xs text-gray-500">Course analytics. Scores are not shown to Head Coaches.</p>
        </div>
        <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700" aria-label="Close analytics">
          <X className="h-4 w-4" />
        </button>
      </div>
      {a.isPending ? (
        <LoadingBlock />
      ) : a.isError ? (
        <ErrorState error={a.error} title="Couldn't load the analytics" onRetry={() => a.refetch()} />
      ) : (
        <div className="space-y-5" data-testid="course-analytics">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Students" value={formatNumber(a.data.students.total)} subtext={`${formatNumber(a.data.students.unrolled)} not started`} />
            <MetricCard label="Opened" value={formatNumber(a.data.students.rolled)} />
            <MetricCard label="Completed" value={formatNumber(a.data.students.completed)} subtext={`${pct(a.data.students.completionRate)} completion`} />
            <MetricCard label="Resources" value={formatNumber(a.data.resources.published)} subtext={`${formatNumber(a.data.resources.totalViews)} views`} />
          </div>
          <TableCard>
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className={th}>Assignment</th>
                <th className={th}>Deadline</th>
                <th className={th}>Submissions</th>
                <th className={th}>Late</th>
                <th className={th}>Results published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {a.data.assignments.length === 0 ? (
                <TableMessage colSpan={5}>No published assignments yet.</TableMessage>
              ) : (
                a.data.assignments.map((w) => (
                  <tr key={w.id}>
                    <td className={`${td} font-medium text-gray-800`}>{w.title}</td>
                    <td className={`${td} text-gray-600`}>{formatDate(w.deadline)}</td>
                    <td className={`${td} text-gray-600`}>
                      {formatNumber(w.submissions)} ({pct(w.submissionRate)})
                    </td>
                    <td className={`${td} text-gray-600`}>{formatNumber(w.lateSubmissions)}</td>
                    <td className={`${td} text-gray-600`}>{formatNumber(w.publishedResults)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
        </div>
      )}
    </Card>
  );
}
