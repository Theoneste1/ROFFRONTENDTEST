"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { School } from "lucide-react";
import { studentsApi, type UserReportFilters } from "@/lib/api/admin";
import type { ReportUserStatus } from "@/lib/api/types";
import { useAdminDivisions, useStudentReport } from "@/lib/queries/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, CsvButton, FilterPills, SearchInput, SelectFilter, TableCard, TableMessage, btnSecondary, linkBtn, td, th } from "../components/adminUi";

const STATUS_BADGE: Record<ReportUserStatus, { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-emerald-50 text-emerald-700" },
  INACTIVE: { label: "Inactive", badge: "bg-gray-100 text-gray-500" },
  AWAITING_SETUP: { label: "Awaiting setup", badge: "bg-amber-50 text-amber-700" },
};

const PAGE_SIZE = 20;

export default function StudentsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const divisionId = params.get("divisionId") ?? "";
  const status = (params.get("status") ?? "") as "" | ReportUserStatus;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const filters: UserReportFilters = { divisionId: divisionId || undefined, status: status || undefined, q: q || undefined, page, limit: PAGE_SIZE };
  const students = useStudentReport(filters);
  const divisions = useAdminDivisions();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Students</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Academic scores are managed by mentors and are not editable here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/schools" className={btnSecondary}>
            <School className="h-3.5 w-3.5" aria-hidden="true" /> Schools
          </Link>
          <CsvButton onDownload={() => studentsApi.exportCsv(filters)} />
        </div>
      </div>

      {/* Controls Bar: Search & Pill Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SearchInput value={q} onChange={(v) => setParam("q", v)} placeholder="Search student…" label="Search students" />
        <FilterPills
          label="Division"
          value={divisionId}
          onChange={(v) => setParam("divisionId", v)}
          options={[{ label: "All", value: "" }, ...(divisions.data ?? []).map((d) => ({ label: d.name.replace(/ division$/i, ""), value: d.id }))]}
        />
        <SelectFilter
          label="Status"
          value={status}
          onChange={(v) => setParam("status", v)}
          options={[{ label: "Any", value: "" }, ...Object.entries(STATUS_BADGE).map(([value, s]) => ({ value, label: s.label }))]}
        />
      </div>

      {students.isError ? (
        <ErrorState error={students.error} title="Couldn't load students" onRetry={() => students.refetch()} />
      ) : (
        <TableCard
          footer={
            students.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={students.data.meta.totalPages} total={students.data.meta.total} onPage={(p) => setParam("page", String(p))} disabled={students.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Student</th>
              <th className={th}>Email</th>
              <th className={th}>Division</th>
              <th className={th}>School</th>
              <th className={th}>Status</th>
              <th className={th}>Assignment activity</th>
              <th className={`${th} text-right`}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${students.isFetching && students.data ? "opacity-60" : ""}`}>
            {students.isPending ? (
              <TableMessage colSpan={7}>Loading students…</TableMessage>
            ) : students.data.data.length === 0 ? (
              <TableMessage colSpan={7}>No students found matching your criteria.</TableMessage>
            ) : (
              students.data.data.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                  <td className={`${td} font-bold text-gray-800 whitespace-nowrap`}>
                    {s.name}
                    <span className="block text-[11px] font-normal text-gray-400">
                      @{s.username} · last sign-in {s.lastLoginAt ? formatDate(s.lastLoginAt) : "never"}
                    </span>
                  </td>
                  <td className={`${td} text-gray-500 font-medium`}>{s.email}</td>
                  <td className={`${td} text-gray-700 font-medium whitespace-nowrap`}>
                    {s.division ? s.division.name.replace(/ division$/i, "") : "—"}
                    {s.gradeLevel && <span className="text-gray-400"> · {s.gradeLevel}</span>}
                  </td>
                  <td className={`${td} text-gray-600`}>{s.school?.name ?? "—"}</td>
                  <td className={td}>
                    <Badge className={STATUS_BADGE[s.status].badge}>{STATUS_BADGE[s.status].label}</Badge>
                  </td>
                  <td className={`${td} text-gray-500 font-medium whitespace-nowrap`}>
                    {formatNumber(s.submissions)} submitted · {formatNumber(s.resultsPublished)} results · {formatNumber(s.points)} pts
                  </td>
                  <td className={`${td} text-right`}>
                    <Link href={`/admin/users/${s.id}`} className={linkBtn} aria-label={`View ${s.name}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </>
  );
}
