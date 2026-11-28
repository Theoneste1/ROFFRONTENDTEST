"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, School } from "lucide-react";
import { IconAction } from "@/app/components/ui/IconAction";
import { studentsApi, type UserReportFilters } from "@/lib/api/admin";
import type { ReportUserStatus } from "@/lib/api/types";
import { useAdminDivisions, useStudentReport } from "@/lib/queries/admin";
import { useSession } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";
import { StudentCell, StudentUsernameCell } from "@/app/components/students/StudentCell";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, CsvButton, SearchInput, TableCard, TableMessage, btnSecondary, td, th } from "../components/adminUi";
import { FilterBar } from "@/app/components/ui/FilterBar";

const STATUS_BADGE: Record<ReportUserStatus, { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-emerald-50 text-emerald-700" },
  INACTIVE: { label: "Inactive", badge: "bg-gray-100 text-gray-600" },
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
  const { can } = useSession();
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
          <p className="text-sm text-gray-600 mt-1 font-medium">Academic scores are managed by coaches and are not editable here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/schools" className={btnSecondary}>
            <School className="h-3.5 w-3.5" aria-hidden="true" /> Schools
          </Link>
          {can("programmes.manageMembers") && (
            <Link href="/admin/programmes" className={btnSecondary}>
              Programmes
            </Link>
          )}
          <CsvButton onDownload={() => studentsApi.exportCsv(filters)} />
        </div>
      </div>

      {/* Search and filters (owner 2026-11-25): "+ Add filter" and the active ones as chips. */}
      <FilterBar
        testId="student-filters"
        search={<SearchInput value={q} onChange={(v) => setParam("q", v)} placeholder="Search student…" label="Search students" />}
        onClearAll={() => {
          const next = new URLSearchParams(params);
          for (const k of ["divisionId", "status", "page"]) next.delete(k);
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
        }}
        filters={[
          { key: "divisionId", kind: "select", label: "Division", value: divisionId, onChange: (v) => setParam("divisionId", v),
            options: (divisions.data ?? []).map((d) => ({ label: d.name.replace(/ division$/i, ""), value: d.id })) },
          { key: "status", kind: "select", label: "Status", value: status, onChange: (v) => setParam("status", v),
            options: Object.entries(STATUS_BADGE).map(([value, s]) => ({ value, label: s.label })) },
        ]}
      />

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
              <th className={th}>Username</th>
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
              <TableMessage colSpan={8}>Loading students…</TableMessage>
            ) : students.data.data.length === 0 ? (
              <TableMessage colSpan={8}>No students found matching your criteria.</TableMessage>
            ) : (
              students.data.data.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                  <td className={`${td} whitespace-nowrap`}>
                    <StudentCell id={s.id} firstName={s.firstName ?? s.name.split(" ")[0] ?? ""} lastName={s.lastName ?? s.name.split(" ").slice(1).join(" ")} avatarUrl={s.avatarUrl} name={s.name}>
                      <span className="block text-[11px] font-normal text-gray-500">Last sign-in {s.lastLoginAt ? formatDate(s.lastLoginAt) : "never"}</span>
                    </StudentCell>
                  </td>
                  <td className={td}><StudentUsernameCell username={s.username} /></td>
                  <td className={`${td} text-gray-600 font-medium`}>{s.email}</td>
                  <td className={`${td} text-gray-700 font-medium whitespace-nowrap`}>
                    {s.division ? s.division.name.replace(/ division$/i, "") : "—"}
                    {s.gradeLevel && <span className="text-gray-500"> · {s.gradeLevel}</span>}
                  </td>
                  <td className={`${td} text-gray-600`}>{s.school?.name ?? "—"}</td>
                  <td className={td}>
                    <Badge className={STATUS_BADGE[s.status].badge}>{STATUS_BADGE[s.status].label}</Badge>
                  </td>
                  <td className={`${td} text-gray-600 font-medium whitespace-nowrap`}>
                    {formatNumber(s.submissions)} submitted · {formatNumber(s.resultsPublished)} results · {formatNumber(s.points)} pts
                  </td>
                  <td className={`${td} text-right`}>
                    <span className="inline-flex justify-end">
                      <IconAction href={`/admin/users/${s.id}`} icon={Eye} tone="slate" label={`View ${s.name}`} />
                    </span>
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
