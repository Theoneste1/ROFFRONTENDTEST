"use client";

/**
 * Submissions of one assignment that are assigned to this mentor
 * (`GET /mentor/reviews?assignmentId=`). Mentors only see work an
 * administrator distributed to them; division-wide totals come from the
 * course analytics.
 *
 * With the backend feature `reviewQueueFilters`, search, status, sort, totals
 * and pagination run on the server, so every assigned submission is reachable
 * (M2). Older backends: one page of 100, filtered in the browser (unchanged).
 */
import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Edit, Users, Calendar } from "lucide-react";
import { useCourseAnalytics, useMentorAssignment, useReviewQueue } from "@/lib/queries/mentor";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { hasFeature } from "@/lib/api/capabilities";
import { isApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { useDebounced } from "@/lib/hooks/useDebounced";
import { LEGACY_LIMIT, legacyCounts, legacyRows, serverQuery } from "@/lib/mentor/review-queue";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import SubmissionsTable from "./components/SubmissionsTable";
import SubmissionControls, { type ControlsState } from "./components/SubmissionControls";
import AssignmentSidebar from "./components/AssignmentSidebar";
import { AssignmentStatusBadge } from "../../../components/mentorUi";

export default function ReviewList({ assignmentId }: { assignmentId: string }) {
  const assignment = useMentorAssignment(assignmentId);
  // Wait for the capabilities: they decide which query to send (no wasted legacy request first).
  const caps = useBackendCapabilities();
  const server = hasFeature(caps.detection, "reviewQueueFilters");
  const [controls, setControlsState] = useState<ControlsState>({ search: "", status: "all", sort: "submitted" });
  const [page, setPage] = useState(1);
  const search = useDebounced(controls.search);
  const setControls = (next: ControlsState) => {
    setControlsState(next);
    setPage(1);
  };
  const queue = useReviewQueue(
    server ? serverQuery(assignmentId, { ...controls, search }, page) : { assignmentId, limit: LEGACY_LIMIT },
    { enabled: !caps.loading },
  );
  const analytics = useCourseAnalytics(assignment.data?.courseId, assignment.data?.divisionId);

  const items = useMemo(() => queue.data?.data ?? [], [queue.data]);
  const rows = useMemo(() => (server ? items : legacyRows(items, controls)), [server, items, controls]);
  const counts = server && queue.data?.counts ? queue.data.counts : legacyCounts(items);
  const filtered = controls.search.trim() !== "" || controls.status !== "all";

  if (assignment.isPending) return <LoadingBlock label="Loading submissions…" />;
  if (assignment.isError) {
    const notFound = isApiError(assignment.error) && [400, 403, 404].includes(assignment.error.status);
    return (
      <div className="min-h-screen bg-[#E6EBF2] p-6 space-y-4">
        <Link href="/mentor/assignments" className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back to Assignments
        </Link>
        {notFound ? (
          <div className="bg-white rounded-2xl border border-slate-200">
            <EmptyState title="Assignment not found" description="It doesn't exist or isn't in one of your courses." />
          </div>
        ) : (
          <ErrorState error={assignment.error} onRetry={() => assignment.refetch()} />
        )}
      </div>
    );
  }

  const a = assignment.data;
  const stat = analytics.data?.assignments.find((x) => x.id === a.id);
  const total = analytics.data?.students.total;
  const submitted = stat?.submissions ?? a._count?.submissions ?? 0;
  const engagement = [
    { label: "Total Students", value: total ?? "—", dot: "bg-blue-600", text: "text-blue-600" },
    { label: "Submitted", value: submitted, dot: "bg-emerald-500", text: "text-emerald-600" },
    { label: "Not Reviewed", value: counts.open, dot: "bg-purple-600", text: "text-purple-600" },
    { label: "Reviewed", value: counts.done, dot: "bg-amber-500", text: "text-amber-500" },
    { label: "Not Submitted", value: total !== undefined ? Math.max(total - submitted, 0) : "—", dot: "bg-rose-500", text: "text-rose-500" },
  ];
  const editable = a.status === "DRAFT" || a.status === "REJECTED";

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 md:p-6 text-slate-800 font-sans">
      <div className="mb-4">
        <Link href={`/mentor/assignments/${a.id}`} className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Assignment
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6 min-w-0">
          {/* Assignment header */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex gap-4 items-start min-w-0">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <FileText className="w-8 h-8" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900 break-words">{a.title}</h1>
                  <span className="px-3 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 rounded-full">{a.course.title}</span>
                  <AssignmentStatusBadge status={a.status} />
                </div>
                {a.description && <p className="text-sm text-slate-500 mt-1 max-w-xl">{a.description}</p>}
                <div className="flex items-center gap-1 text-xs text-slate-400 mt-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Due {formatDateTime(a.deadline)}</span>
                </div>
              </div>
            </div>
            {editable && (
              <Link
                href={`/mentor/assignments/${a.id}/edit`}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-[#2B2BB2] text-white font-medium text-sm rounded-xl hover:bg-indigo-800 transition w-full md:w-auto"
              >
                <Edit className="w-4 h-4" />
                Edit Assignment
              </Link>
            )}
          </div>

          {/* Engagement */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <Users className="w-7 h-7" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Student Engagement</h2>
                <p className="text-xs text-slate-400">Division totals; review counts are for work assigned to you.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 w-full md:w-auto text-center md:text-left">
              {engagement.map((e) => (
                <div key={e.label}>
                  <div className={`flex items-center justify-center md:justify-start gap-1.5 font-bold text-xl ${e.text}`}>
                    <span className={`w-2 h-2 rounded-full inline-block ${e.dot}`} />
                    {e.value}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{e.label}</p>
                </div>
              ))}
            </div>
          </div>

          <SubmissionControls value={controls} onChange={setControls} />

          {queue.isPending ? (
            <LoadingBlock label="Loading your review queue…" />
          ) : queue.isError ? (
            <ErrorState error={queue.error} title="Couldn't load submissions" onRetry={() => queue.refetch()} />
          ) : (server ? counts.all === 0 : items.length === 0) ? (
            <div className="bg-white rounded-2xl border border-slate-200">
              <EmptyState
                title="No submissions assigned to you yet"
                description="An administrator distributes submitted work to coaches. Assigned work appears here."
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200">
              <EmptyState title="No submissions match" description={filtered ? "Try another search or status." : "Nothing on this page."} />
            </div>
          ) : (
            <>
              <SubmissionsTable assignmentId={a.id} maximumMarks={a.maximumMarks} rows={rows} />
              {server && queue.data && (
                <Pagination page={page} totalPages={queue.data.meta.totalPages} total={queue.data.meta.total} onPage={setPage} disabled={queue.isFetching} />
              )}
            </>
          )}
        </div>

        <AssignmentSidebar assignment={a} />
      </div>
    </div>
  );
}
