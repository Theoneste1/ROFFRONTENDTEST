"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SubmissionStatus } from "@/lib/api/types";
import { isApiError } from "@/lib/api/errors";
import { useAdminAssignment, useAdminSubmissions, useAssignmentReport } from "@/lib/queries/admin";
import { personName } from "@/lib/format";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, SubmissionBadge } from "../../components/adminUi";
import PublishPanel from "./PublishPanel";

const TABS: { label: string; value: "" | SubmissionStatus }[] = [
  { label: "All", value: "" },
  { label: "Awaiting approval", value: "SUBMITTED_TO_ADMIN" },
  { label: "Approved", value: "APPROVED" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Sent back", value: "REJECTED" },
];

/**
 * Results of one assignment (original design): progress cards and the mentor
 * reviews. Rows open the submission page, where reviews are approved or sent
 * back; publication is added there and on the results list.
 */
export default function AssignmentResults({ assignmentId }: { assignmentId: string }) {
  const assignment = useAdminAssignment(assignmentId);
  const a = assignment.data;
  const report = useAssignmentReport(a ? { courseId: a.courseId, divisionId: a.divisionId, status: a.status } : {});
  const [status, setStatus] = useState<"" | SubmissionStatus>("");
  const [page, setPage] = useState(1);
  const subs = useAdminSubmissions({ assignmentId, status: status || undefined, page, limit: 20 }, !!a);

  const back = (
    <Link href="/admin/results" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 mb-3 transition-colors">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      <span>Results</span>
    </Link>
  );
  const shell = (children: React.ReactNode) => <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">{back}{children}</div>;

  if (assignment.isPending) return shell(<LoadingBlock />);
  if (assignment.isError)
    return shell(<ErrorState error={assignment.error} title={isApiError(assignment.error) && [400, 404].includes(assignment.error.status) ? "Assignment not found" : "Couldn't load this assignment"} onRetry={() => assignment.refetch()} />);

  const row = report.data?.data.find((r) => r.id === assignmentId);
  const reviewed = row ? row.byStage.approved + row.byStage.published : undefined;
  const pending = row ? row.submitted - (reviewed ?? 0) : undefined;
  const v = (n: number | null | undefined, suffix = "") => (n === undefined ? "…" : n === null ? "—" : `${n}${suffix}`);

  return shell(
    <>
      {/* Header Section */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{a!.title}</h1>
        <p className="text-sm text-gray-500 mt-1 font-medium">
          {a!.division.name.replace(/ division$/i, "")} · {a!.course.title}
          {row && ` · ${row.expectedStudents} students`}
        </p>
      </div>

      {/* Callout Banner */}
      {row && pending! > 0 && (
        <div className="bg-gray-100/80 border border-gray-200/80 rounded-2xl px-5 py-3.5 mb-6">
          <p className="text-xs text-gray-600 font-medium">
            {pending} submission{pending === 1 ? " is" : "s are"} not yet approved ({row.byStage.awaitingDistribution} to distribute, {row.byStage.inReview} with coaches, {row.byStage.awaitingApproval} awaiting your approval). Approved results can be published at any time.
          </p>
        </div>
      )}

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          ["Submitted", v(row?.submitted)],
          ["Reviewed", v(reviewed)],
          ["Pending", v(pending)],
          ["Average score", v(row ? row.averageScore : undefined, "%")],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-2xl p-5 shadow-xs border border-gray-100/80">
            <p className="text-[11px] font-bold text-gray-400 tracking-wider uppercase mb-1">{label}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <PublishPanel assignmentId={assignmentId} />

      <div className="mb-4 overflow-x-auto pb-1">
        <FilterPills
          label="Review status"
          value={status}
          onChange={(x) => {
            setStatus(x);
            setPage(1);
          }}
          options={TABS}
        />
      </div>

      {/* Main Table Card */}
      {subs.isError ? (
        <ErrorState error={subs.error} title="Couldn't load the reviews" onRetry={() => subs.refetch()} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-xs font-bold text-gray-900">Coach reviews</h2>
          </div>
          <div className="relative overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Student", "Score", "Coach", "Feedback", "Status", ""].map((h) => (
                    <th key={h} className="px-4 sm:px-6 py-3.5 text-xs font-semibold text-gray-500">
                      {h || <span className="sr-only">Action</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100/80 ${subs.isFetching && subs.data ? "opacity-60" : ""}`}>
                {subs.isPending ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-xs text-gray-400">
                      Loading reviews…
                    </td>
                  </tr>
                ) : subs.data.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-xs text-gray-400">
                      No submissions in this state.
                    </td>
                  </tr>
                ) : (
                  subs.data.data.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                      <td className="px-4 sm:px-6 py-3.5 font-bold text-gray-900 whitespace-nowrap">{personName(s.student)}</td>
                      <td className="px-4 sm:px-6 py-3.5 text-gray-600 font-medium whitespace-nowrap">{s.review?.percentage != null ? `${s.review.percentage}%` : "—"}</td>
                      <td className="px-4 sm:px-6 py-3.5 text-gray-600 font-medium whitespace-nowrap">{personName(s.review?.mentor, "—")}</td>
                      <td className="px-4 sm:px-6 py-3.5 text-gray-500 font-normal max-w-xs truncate" title={s.review?.feedback ?? undefined}>
                        {s.review?.feedback || "—"}
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">
                        <SubmissionBadge status={s.status} />
                      </td>
                      <td className="px-4 sm:px-6 py-3.5">
                        <Link href={`/admin/submissions/${s.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap">
                          {s.status === "SUBMITTED_TO_ADMIN" ? "Review" : "Open"}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {subs.data && (
            <div className="px-4 pb-4">
              <Pagination page={page} totalPages={subs.data.meta.totalPages} total={subs.data.meta.total} onPage={setPage} disabled={subs.isFetching} />
            </div>
          )}
        </div>
      )}
    </>,
  );
}
