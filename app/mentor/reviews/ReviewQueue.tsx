"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useReviewQueue, useTeachingScopes } from "@/lib/queries/mentor";
import type { SubmissionStatus } from "@/lib/api/types";
import { formatDateTime, personName } from "@/lib/format";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { OPEN_REVIEW_STATUSES, ReviewStatusBadge, ScopeSelect, parseScopeKey } from "../components/mentorUi";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "ASSIGNED", label: "Not reviewed" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "MARKED", label: "Marked" },
  { value: "REJECTED", label: "Sent back by admin" },
  { value: "RESUBMISSION_REQUESTED", label: "Resubmission requested" },
  { value: "SUBMITTED_TO_ADMIN", label: "Awaiting admin approval" },
  { value: "PUBLISHED", label: "Published" },
];

const PAGE_SIZE = 20;

export default function ReviewQueue() {
  const params = useSearchParams();
  const assignmentId = params.get("assignmentId") ?? undefined;
  const [scope, setScope] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const scopes = useTeachingScopes();
  const sc = parseScopeKey(scope);
  const queue = useReviewQueue({
    assignmentId,
    courseId: sc?.courseId,
    divisionId: sc?.divisionId,
    status: status === "all" ? undefined : (status as SubmissionStatus),
    page,
    limit: PAGE_SIZE,
  });

  return (
    <div className="min-h-screen p-4 md:p-10 font-sans text-slate-800 bg-[#E6EBF2]">
      <div className="max-w-5xl">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reviews</h1>
        <p className="text-slate-500 text-sm mt-1 mb-6">Student work an administrator assigned to you for review.</p>

        <div className="flex flex-wrap items-end gap-4 mb-6">
          {scopes.data && scopes.data.length > 0 && (
            <ScopeSelect
              scopes={scopes.data}
              value={scope}
              includeAll
              onChange={(v) => {
                setScope(v);
                setPage(1);
              }}
            />
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="status" className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {assignmentId && (
            <Link href="/mentor/reviews" className="text-xs font-semibold text-indigo-700 hover:underline pb-2">
              Show all assignments
            </Link>
          )}
        </div>

        {queue.isPending ? (
          <LoadingBlock label="Loading your reviews…" />
        ) : queue.isError ? (
          <ErrorState error={queue.error} title="Couldn't load your reviews" onRetry={() => queue.refetch()} />
        ) : queue.data.data.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <EmptyState title="Nothing to review" description="Work assigned to you by an administrator appears here." />
          </div>
        ) : (
          <div className="space-y-3">
            {queue.data.data.map((s) => (
              <Link
                key={s.id}
                href={`/mentor/assignments/${s.assignment.id}/assignmentReview/${s.id}`}
                className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                    <ClipboardCheck className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 truncate">{personName(s.student)}</h3>
                    <p className="text-xs text-slate-500 truncate">
                      {s.assignment.title} · {s.assignment.course.title} · {s.assignment.division.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Submitted {formatDateTime(s.submittedAt)}
                      {s.isLate && " · late"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ReviewStatusBadge status={s.status} />
                  <span className={`text-xs font-semibold ${OPEN_REVIEW_STATUSES.includes(s.status) ? "text-indigo-700" : "text-slate-500"}`}>
                    {OPEN_REVIEW_STATUSES.includes(s.status) ? "Review →" : "View →"}
                  </span>
                </div>
              </Link>
            ))}
            <Pagination page={page} totalPages={queue.data.meta.totalPages} total={queue.data.meta.total} onPage={setPage} disabled={queue.isFetching} />
          </div>
        )}
      </div>
    </div>
  );
}
