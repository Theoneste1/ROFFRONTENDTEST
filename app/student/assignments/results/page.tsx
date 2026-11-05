"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock, FileText } from "lucide-react";
import { useMyResults } from "@/lib/queries/assessment";
import { useCourses } from "@/lib/queries/learning";
import { formatDate } from "@/lib/format";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";

type Arrange = "date" | "score" | "name";

const PAGE_SIZE = 20;

/**
 * Published results (`GET /me/results`). Course filter and paging run on the
 * server; "Arrange by" sorts the loaded page (the API has no sort parameter).
 */
export default function ResultsPage() {
  const courses = useCourses();
  // Pending selections are applied with the Apply button (original design).
  const [courseSel, setCourseSel] = useState("all");
  const [arrangeSel, setArrangeSel] = useState<Arrange>("date");
  const [applied, setApplied] = useState<{ courseId: string; arrange: Arrange }>({ courseId: "all", arrange: "date" });
  const [page, setPage] = useState(1);

  const query = useMyResults({ courseId: applied.courseId === "all" ? undefined : applied.courseId, page, limit: PAGE_SIZE });

  const rows = useMemo(() => {
    const items = (query.data?.data ?? []).slice();
    if (applied.arrange === "score") items.sort((a, b) => b.percentage - a.percentage);
    else if (applied.arrange === "name") items.sort((a, b) => a.assignment.title.localeCompare(b.assignment.title));
    else items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    return items;
  }, [query.data, applied.arrange]);

  const dirty = courseSel !== applied.courseId || arrangeSel !== applied.arrange;

  return (
    <div className="min-h-screen p-4 md:p-8 bg-[#E6EBF2]">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Results</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review your published results and your mentors&apos; feedback</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="course" className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
              Course
            </label>
            <div className="relative">
              <select
                id="course"
                value={courseSel}
                onChange={(e) => setCourseSel(e.target.value)}
                className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-600 w-52 shadow-sm"
              >
                <option value="all">All courses</option>
                {(courses.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="arrange" className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
              Arrange by
            </label>
            <div className="relative">
              <select
                id="arrange"
                value={arrangeSel}
                onChange={(e) => setArrangeSel(e.target.value as Arrange)}
                className="appearance-none bg-white border border-gray-200 text-gray-700 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:ring-1 focus:ring-blue-600 w-52 shadow-sm"
              >
                <option value="date">Date published (newest)</option>
                <option value="score">Score (highest)</option>
                <option value="name">Name (A–Z)</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              setApplied({ courseId: courseSel, arrange: arrangeSel });
              setPage(1);
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm px-5 py-2 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/60 overflow-hidden">
          {query.isPending ? (
            <LoadingBlock label="Loading results…" />
          ) : query.isError ? (
            <div className="p-4">
              <ErrorState error={query.error} title="Couldn't load your results" onRetry={() => query.refetch()} />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No results yet"
              description={applied.courseId === "all" ? "Results appear here once your mentors' reviews are published." : "No published results for this course."}
            />
          ) : (
            <div className={`overflow-x-auto ${query.isFetching ? "opacity-70" : ""}`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#D9E1F2] text-gray-700 text-xs font-semibold uppercase tracking-wider">
                    <th className="py-3.5 px-6 font-semibold w-5/12">Assignment Name</th>
                    <th className="py-3.5 px-6 font-semibold w-3/12">Due</th>
                    <th className="py-3.5 px-6 font-semibold w-2/12">Score</th>
                    <th className="py-3.5 px-6 font-semibold w-2/12 text-right pr-8">Feedback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-800">
                  {rows.map((r) => {
                    const href = `/student/assignments/${r.assignment.id}?tab=results`;
                    return (
                      <tr key={r.submissionId} className="hover:bg-gray-50/60 transition-colors">
                        <td className="py-4 px-6 font-medium text-gray-900">
                          <Link href={href} className="hover:text-indigo-700">
                            {r.assignment.title}
                          </Link>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {r.assignment.course.title} · published {formatDate(r.publishedAt)}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-gray-600">
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                            <span>{formatDate(r.assignment.deadline)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-medium text-gray-700 whitespace-nowrap">
                          {r.score}/{r.maximumMarks}
                          <span className="ml-2 text-xs text-gray-400">{r.percentage}%</span>
                        </td>
                        <td className="py-4 px-6 text-right pr-8">
                          <Link
                            href={href}
                            className="inline-flex items-center justify-center gap-1.5 p-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 text-xs font-semibold"
                            aria-label={`Open result and feedback for ${r.assignment.title}`}
                          >
                            <FileText className="h-4 w-4" /> View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {query.data && <Pagination page={page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} onPage={setPage} disabled={query.isFetching} />}
      </div>
    </div>
  );
}
