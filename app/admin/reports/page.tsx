"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { REPORT_EXPORTS, downloadCsv, reportsApi } from "@/lib/api/admin";
import type { ReportFilters } from "@/lib/api/types";
import { useAdminDashboard, useAdminDivisions, useAssignmentReport, useCourseParticipation, useResultsReport, useReviewsReport } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";
import { useNow } from "@/lib/hooks/useNow";
import { formatNumber } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import { CsvButton } from "../components/adminUi";

interface ReportItemProps {
  label: string;
  value: string | number | undefined;
  total?: number;
  hasProgressBar?: boolean;
}

const ReportItem: React.FC<ReportItemProps> = ({ label, value, total, hasProgressBar }) => {
  const numericVal = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  const progressPct = hasProgressBar && total && !isNaN(numericVal) ? Math.min(100, Math.round((numericVal / total) * 100)) : 0;
  const shown = value === undefined ? "…" : typeof value === "number" ? formatNumber(value) : value;
  return (
    <div className="py-3 border-b border-gray-100 last:border-0 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-gray-500 font-medium">{label}</span>
        <div className="font-bold text-gray-900 shrink-0">
          {total !== undefined ? (
            <span>
              <span className="text-gray-900">{shown}</span>
              <span className="text-gray-400 font-normal"> / {formatNumber(total)}</span>
            </span>
          ) : (
            <span>{shown}</span>
          )}
        </div>
      </div>
      {hasProgressBar && (
        <div className="w-full bg-gray-100 rounded-full h-1 mt-2.5 overflow-hidden" aria-hidden="true">
          <div className="bg-indigo-600 h-full rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
        </div>
      )}
    </div>
  );
};

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white text-xs font-semibold text-gray-700 pl-4 pr-9 py-2 rounded-xl border border-gray-200/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer shadow-2xs"
      >
        {children}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

const card = "bg-white rounded-2xl p-6 shadow-xs border border-gray-100/80";
const pct = (n: number | null | undefined) => (n === undefined ? undefined : n === null ? "—" : `${Math.round(n)}%`);

export default function ReportsContent() {
  const now = useNow(60 * 60_000);
  const courses = useCourses();
  const divisions = useAdminDivisions();
  const [courseId, setCourseId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [timeframe, setTimeframe] = useState<"30" | "7" | "all">("30");

  // Plain dates (stable query keys within a day); the backend reads a date as the whole day.
  const filters = useMemo<ReportFilters>(() => {
    const f: ReportFilters = { courseId: courseId || undefined, divisionId: divisionId || undefined };
    if (timeframe !== "all") f.from = new Date(now - Number(timeframe) * 86_400_000).toISOString().slice(0, 10);
    return f;
  }, [courseId, divisionId, timeframe, now]);

  const dashboard = useAdminDashboard(filters);
  const assignments = useAssignmentReport(filters);
  const reviews = useReviewsReport(filters);
  const results = useResultsReport({ ...filters, limit: 1 });
  const participation = useCourseParticipation(filters);

  const d = dashboard.data;
  const rows = assignments.data?.data;
  const expected = rows?.reduce((n, r) => n + r.expectedStudents, 0);
  const submitted = rows?.reduce((n, r) => n + r.submitted, 0);
  const stage = assignments.data?.summary as { submissions: number; byStage: { approved: number; published: number } } | undefined;
  const reviewed = stage ? stage.byStage.approved + stage.byStage.published : undefined;
  const avgScore = results.data ? results.data.summary.averagePublishedScore : undefined;
  const byDivision = (divisions.data ?? []).map((div) => {
    const r = participation.data?.rows.filter((x) => x.division.id === div.id) ?? [];
    const students = r[0]?.students ?? 0;
    const avg = r.length ? Math.round(r.reduce((n, x) => n + x.participationRate, 0) / r.length) : 0;
    return { div, students, avg, loaded: !!participation.data };
  });
  const error = dashboard.error ?? assignments.error ?? reviews.error ?? participation.error;
  const exportQuery = { courseId: filters.courseId, divisionId: filters.divisionId, from: filters.from };

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      {/* Header Section */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Reports</h1>
        <p className="text-sm text-gray-500 mt-1 font-medium">Live figures for the current academic year, filtered by course, division and period.</p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <FilterSelect label="Course" value={courseId} onChange={setCourseId}>
          <option value="">All Courses</option>
          {(courses.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Division" value={divisionId} onChange={setDivisionId}>
          <option value="">All Divisions</option>
          {(divisions.data ?? []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Period" value={timeframe} onChange={(v) => setTimeframe(v as "30" | "7" | "all")}>
          <option value="30">Last 30 days</option>
          <option value="7">Last 7 days</option>
          <option value="all">All time</option>
        </FilterSelect>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorState error={error} title="Some figures couldn't be loaded" onRetry={() => [dashboard, assignments, reviews, participation].forEach((q) => q.refetch())} />
        </div>
      )}

      {/* Grid Container for Report Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className={card} aria-labelledby="r-students">
          <h2 id="r-students" className="text-sm font-bold text-gray-900 mb-4">
            Student Activity
          </h2>
          <div className="divide-y divide-gray-100">
            <ReportItem label="Active students" value={d?.students.active} total={d?.students.total} hasProgressBar />
            <ReportItem label="Assignment submissions" value={d?.submissions.total} />
            <ReportItem label="Late submissions" value={d?.submissions.late} />
          </div>
        </section>

        <section className={card} aria-labelledby="r-assign">
          <h2 id="r-assign" className="text-sm font-bold text-gray-900 mb-4">
            Assignment Performance
          </h2>
          <div className="divide-y divide-gray-100">
            <ReportItem label="Submission rate" value={expected === undefined ? undefined : expected ? pct((submitted! / expected) * 100) : "—"} />
            <ReportItem label="Review completion" value={reviewed} total={stage?.submissions} hasProgressBar />
            <ReportItem label="Average published score" value={pct(avgScore)} />
          </div>
        </section>

        <section className={card} aria-labelledby="r-reviews">
          <h2 id="r-reviews" className="text-sm font-bold text-gray-900 mb-4">
            Coach Review Activity
          </h2>
          <div className="divide-y divide-gray-100">
            <ReportItem label="With coaches" value={d?.reviews.pendingMentorReview} />
            <ReportItem label="Awaiting your approval" value={reviews.data?.pending.awaitingAdminApproval} />
            <ReportItem label="Completed reviews" value={reviews.data?.completed.total} />
            <ReportItem
              label="Average review time"
              value={reviews.data ? (reviews.data.completed.averageTurnaroundHours == null ? "—" : `${Math.round(reviews.data.completed.averageTurnaroundHours)} h`) : undefined}
            />
          </div>
        </section>

        <section className={card} aria-labelledby="r-divisions">
          <h2 id="r-divisions" className="text-sm font-bold text-gray-900 mb-4">
            Division Overview
          </h2>
          <div className="divide-y divide-gray-100">
            {byDivision.map(({ div, students, avg, loaded }) => (
              <ReportItem key={div.id} label={`${div.name.replace(/ division$/i, "")} participation (avg. across courses, ${formatNumber(students)} students)`} value={loaded ? avg : undefined} total={100} hasProgressBar />
            ))}
          </div>
        </section>

        <section className={`${card} lg:col-span-2`} aria-labelledby="r-exports">
          <h2 id="r-exports" className="text-sm font-bold text-gray-900 mb-1">
            Exports
          </h2>
          <p className="text-xs text-gray-500 mb-4">CSV files with the filters above. Exports contain personal data; each download is recorded in the audit log.</p>
          <div className="flex flex-wrap gap-2">
            {REPORT_EXPORTS.map((x) => (
              <CsvButton key={x.key} label={x.label} onDownload={() => downloadCsv(x.path, "noFilters" in x ? {} : exportQuery, `${x.key}.csv`)} />
            ))}
            {(divisions.data ?? []).map((x) => (
              <CsvButton key={x.id} label={`Student progress · ${x.name.replace(/ division$/i, "")}`} onDownload={() => reportsApi.studentProgressCsv(x.id)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
