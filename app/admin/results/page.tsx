"use client";

import { useState } from "react";
import Link from "next/link";
import { downloadCsv } from "@/lib/api/admin";
import { useResultsReport } from "@/lib/queries/admin";
import { formatDate } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { CsvButton } from "../components/adminUi";

/**
 * Results publication per assignment (`GET /admin/reports/results-publication`),
 * in the original table design. The action is driven by the data: approved
 * results waiting → "Review & Publish"; otherwise "View".
 */
export default function ResultsTable() {
  const [page, setPage] = useState(1);
  const report = useResultsReport({ page, limit: 20 });

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Results</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Coaches score and give feedback. You check completed reviews and publish results.</p>
        </div>
        <CsvButton onDownload={() => downloadCsv("/admin/reports/results-publication.csv", {}, "results-publication.csv")} />
      </div>

      {report.data && (
        <p className="text-xs text-gray-500 mb-4">
          {report.data.summary.resultsPublished} results published in {report.data.summary.releases} release{report.data.summary.releases === 1 ? "" : "s"} · {report.data.summary.awaitingPublication} approved and waiting
        </p>
      )}

      {report.isError ? (
        <ErrorState error={report.error} title="Couldn't load results" onRetry={() => report.refetch()} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  {["Assignment", "Course", "Division", "Reviewed", "Ready", "Published"].map((h) => (
                    <th key={h} className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500">
                      {h}
                    </th>
                  ))}
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500 text-right sm:pr-8">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100/80 ${report.isFetching && report.data ? "opacity-60" : ""}`}>
                {report.isPending ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-xs text-gray-400">
                      Loading results…
                    </td>
                  </tr>
                ) : report.data.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-xs text-gray-400">
                      No published assignments yet.
                    </td>
                  </tr>
                ) : (
                  report.data.data.map((r) => {
                    const reviewed = r.awaitingPublication + r.published;
                    const ready = r.awaitingPublication;
                    const allPublished = r.submissions > 0 && r.published === r.submissions;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                        {/* Assignment Title + Submissions Subtext */}
                        <td className="px-4 sm:px-6 py-4">
                          <div className="font-bold text-gray-900">{r.title}</div>
                          <div className="text-[11px] text-gray-400 font-medium mt-0.5">
                            {r.submissions} submission{r.submissions === 1 ? "" : "s"} · due {formatDate(r.deadline)}
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-gray-600 font-medium whitespace-nowrap">{r.course.title}</td>
                        <td className="px-4 sm:px-6 py-4 text-gray-600 font-medium whitespace-nowrap">{r.division.name.replace(/ division$/i, "")}</td>
                        <td className="px-4 sm:px-6 py-4 text-gray-600 font-medium whitespace-nowrap">
                          {reviewed} / {r.submissions}
                          {r.awaitingApproval > 0 && <span className="block text-[11px] text-amber-600">{r.awaitingApproval} awaiting approval</span>}
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-gray-500 font-medium">{ready}</td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${allPublished ? "bg-emerald-50 text-emerald-700" : r.published > 0 ? "bg-blue-50 text-blue-700" : "bg-amber-50/80 text-amber-700"}`}>
                            {allPublished ? "Results Published" : r.published > 0 ? `${r.published} published` : "Not Published"}
                          </span>
                          {r.lastPublishedAt && <span className="block text-[11px] text-gray-400 mt-0.5">{formatDate(r.lastPublishedAt)}</span>}
                        </td>
                        {/* Action Buttons */}
                        <td className="px-4 sm:px-6 py-4 text-right sm:pr-8">
                          {ready > 0 ? (
                            <Link href={`/admin/results/${r.id}`} className="inline-block px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors shadow-xs whitespace-nowrap">
                              Review &amp; Publish
                            </Link>
                          ) : r.awaitingApproval > 0 ? (
                            <Link href={`/admin/results/${r.id}`} className="inline-block px-4 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium rounded-lg transition-colors shadow-2xs whitespace-nowrap">
                              Review &amp; Publish
                            </Link>
                          ) : (
                            <Link href={`/admin/results/${r.id}`} className="inline-block px-4 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-800 font-medium rounded-lg transition-colors shadow-2xs">
                              View
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {report.data && (
            <div className="px-4 pb-4">
              <Pagination page={page} totalPages={report.data.meta.totalPages} total={report.data.meta.total} onPage={setPage} disabled={report.isFetching} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
