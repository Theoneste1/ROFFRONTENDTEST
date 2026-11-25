"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { downloadCsv, type AdminAssignmentFilters } from "@/lib/api/admin";
import type { AssignmentReportRow, AssignmentStatus } from "@/lib/api/types";
import { useAdminAssignments, useAdminDivisions, useAssignmentReport } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";
import { formatDate, personName } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AssignmentBadge, CsvButton, FilterPills, SearchInput, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";
import { FilterBar } from "@/app/components/ui/FilterBar";
import { useRecordBulk } from "../components/bulk/RecordBulk";
import { bulkFilterFrom } from "@/lib/admin/bulk-records";

const TABS: { label: string; value: "" | AssignmentStatus }[] = [
  { label: "All", value: "" },
  { label: "Awaiting approval", value: "PENDING_APPROVAL" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Closed", value: "CLOSED" },
  { label: "Returned to coach", value: "REJECTED" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Archived", value: "ARCHIVED" },
];

const PAGE_SIZE = 20;

/** Reviewed = approved + published of the submissions received. */
function ReviewProgress({ row }: { row: AssignmentReportRow | undefined }) {
  if (!row) return <span className="text-gray-500">—</span>;
  const done = row.byStage.approved + row.byStage.published;
  const pct = row.submitted ? Math.round((done / row.submitted) * 100) : 0;
  return (
    <div className="flex items-center gap-3 min-w-[150px]">
      <div className="w-full bg-gray-200/80 rounded-full h-1.5 overflow-hidden" aria-hidden="true">
        <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-gray-600 font-medium shrink-0">
        {done} / {row.submitted}
      </span>
    </div>
  );
}

export default function AssignmentsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = (TABS.some((t) => t.value === params.get("status")) ? params.get("status") : "") as "" | AssignmentStatus;
  const courseId = params.get("courseId") ?? "";
  const divisionId = params.get("divisionId") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const filters: AdminAssignmentFilters = { status: status || undefined, courseId: courseId || undefined, divisionId: divisionId || undefined, q: q || undefined, page, limit: PAGE_SIZE };
  const assignments = useAdminAssignments(filters);
  // Bulk actions (capability bulkOperationsGeneric, record type ASSIGNMENT): publish, close or archive many at once.
  const bulk = useRecordBulk("ASSIGNMENT", {
    pageIds: assignments.data?.data.map((a) => a.id) ?? [],
    filter: bulkFilterFrom(filters),
    total: assignments.data?.meta.total,
    onStarted: () => void assignments.refetch(),
  });
  const cols = bulk.enabled ? 9 : 8;
  const report = useAssignmentReport({ status: filters.status, courseId: filters.courseId, divisionId: filters.divisionId });
  const pending = useAdminAssignments({ status: "PENDING_APPROVAL", limit: 1 });
  const courses = useCourses();
  const divisions = useAdminDivisions();
  const byId = new Map((report.data?.data ?? []).map((r) => [r.id, r]));

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const pendingCount = pending.data?.meta.total;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Assignments</h1>
          <p className="text-sm text-gray-600 mt-1 font-medium">
            Coaches prepare assignments; administrators approve and publish them, then follow submissions and reviews.
          </p>
        </div>
        <CsvButton onDownload={() => downloadCsv("/admin/reports/assignments.csv", { status: filters.status, courseId: filters.courseId, divisionId: filters.divisionId }, "assignments.csv")} />
      </div>

      {/* Search and filters (owner 2026-11-25): "+ Add filter" and the active ones as chips; the status tabs below. */}
      <FilterBar
        testId="assignment-filters"
        search={<SearchInput value={q} onChange={(v) => setParam("q", v)} placeholder="Search assignments…" label="Search assignments" />}
        onClearAll={() => {
          // Clears the filters; the status tab and the search stay.
          const next = new URLSearchParams(params);
          for (const k of ["courseId", "divisionId", "page"]) next.delete(k);
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
        }}
        filters={[
          { key: "courseId", kind: "select", label: "Course", value: courseId, onChange: (v) => setParam("courseId", v),
            options: (courses.data ?? []).map((c) => ({ label: c.title, value: c.id })) },
          { key: "divisionId", kind: "select", label: "Division", value: divisionId, onChange: (v) => setParam("divisionId", v),
            options: (divisions.data ?? []).map((d) => ({ label: d.name, value: d.id })) },
        ]}
      />
      <div className="mb-6">
        <FilterPills
          label="Status"
          value={status}
          onChange={(v) => setParam("status", v)}
          options={TABS.map((t) => (t.value === "PENDING_APPROVAL" && pendingCount ? { ...t, count: pendingCount } : t))}
        />
      </div>

      {bulk.toolbar}
      {assignments.isError ? (
        <ErrorState error={assignments.error} title="Couldn't load assignments" onRetry={() => assignments.refetch()} />
      ) : (
        <TableCard
          footer={
            assignments.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={assignments.data.meta.totalPages} total={assignments.data.meta.total} onPage={(p) => setParam("page", String(p))} disabled={assignments.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              {bulk.enabled && <th className={`${th} w-8`}>{bulk.headerCheckbox}</th>}
              <th className={th}>Assignment</th>
              <th className={th}>Course</th>
              <th className={th}>Division</th>
              <th className={th}>Due date</th>
              <th className={th}>Submissions</th>
              <th className={th}>Review progress</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${assignments.isFetching && assignments.data ? "opacity-60" : ""}`}>
            {assignments.isPending ? (
              <TableMessage colSpan={cols}>Loading assignments…</TableMessage>
            ) : assignments.data.data.length === 0 ? (
              <TableMessage colSpan={cols}>{status === "PENDING_APPROVAL" ? "No assignments are waiting for approval." : "No assignments found matching your criteria."}</TableMessage>
            ) : (
              assignments.data.data.map((a) => {
                const r = byId.get(a.id);
                return (
                  <tr key={a.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                    {bulk.enabled && <td className={td}>{bulk.rowCheckbox(a.id, a.title)}</td>}
                    <td className={`${td} font-bold text-gray-800`}>
                      <Link href={`/admin/assignments/${a.id}`} className="hover:text-indigo-700">
                        {a.title}
                      </Link>
                      <span className="block text-[11px] font-normal text-gray-500">by {personName(a.createdBy, "a coach")}</span>
                    </td>
                    <td className={`${td} text-gray-600 font-medium whitespace-nowrap`}>{a.course.title}</td>
                    <td className={`${td} text-gray-600 font-medium whitespace-nowrap`}>{a.division.name.replace(/ division$/i, "")}</td>
                    <td className={`${td} text-gray-600 whitespace-nowrap`}>{formatDate(a.deadline)}</td>
                    <td className={`${td} text-gray-600 whitespace-nowrap`}>{r ? `${r.submitted} / ${r.expectedStudents} submitted` : `${a._count?.submissions ?? 0} submitted`}</td>
                    <td className={td}>
                      <ReviewProgress row={r} />
                    </td>
                    <td className={td}>
                      <AssignmentBadge status={a.status} />
                    </td>
                    <td className={td}>
                      <Link href={`/admin/assignments/${a.id}`} className={linkBtn} aria-label={`Open ${a.title}`}>
                        {a.status === "PENDING_APPROVAL" ? "Review" : "Open"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}
      {bulk.dialog}
    </>
  );
}
