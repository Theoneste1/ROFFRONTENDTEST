"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { downloadCsv, type UserReportFilters } from "@/lib/api/admin";
import type { MentorReportRow, ReportUserStatus } from "@/lib/api/types";
import { useAdminDivisions, useMentorReport, useMentorRequests } from "@/lib/queries/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, CsvButton, FilterPills, SearchInput, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "../../components/adminUi";
import CourseAccessDialog from "./CourseAccessDialog";
import ApplicationsPanel from "./ApplicationsPanel";

const STATUS_BADGE: Record<ReportUserStatus, { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-emerald-50 text-emerald-700" },
  INACTIVE: { label: "Inactive", badge: "bg-gray-100 text-gray-500" },
  AWAITING_SETUP: { label: "Awaiting setup", badge: "bg-amber-50 text-amber-700" },
};

const PAGE_SIZE = 20;

/** No course access, or an account that has not been set up yet. */
const needsAttention = (m: MentorReportRow) => m.teaching.length === 0 || m.status === "AWAITING_SETUP";

export default function MentorsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "applications" ? "applications" : "mentors";
  const divisionId = params.get("divisionId") ?? "";
  const status = (params.get("status") ?? "") as "" | ReportUserStatus;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const accessFor = params.get("mentor");

  const [accessName, setAccessName] = useState<string | null>(null);

  const filters: UserReportFilters = { divisionId: divisionId || undefined, status: status || undefined, q: q || undefined, page, limit: PAGE_SIZE };
  const mentors = useMentorReport(filters);
  const divisions = useAdminDivisions();
  const pending = useMentorRequests({ status: "PENDING", limit: 1 });
  const pendingCount = pending.data?.meta.total;

  function setParam(key: string, value: string | null, keepPage = false) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (!keepPage && key !== "page" && key !== "mentor") next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const divisionTabs = [{ label: "All", value: "" }, ...(divisions.data ?? []).map((d) => ({ label: d.name.replace(/ division$/i, ""), value: d.id }))];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Coaches</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">Coaches review submissions, give scores and formal feedback.</p>
        </div>
        {tab === "mentors" && <CsvButton onDownload={() => downloadCsv("/admin/reports/mentors.csv", { divisionId: filters.divisionId, status: filters.status, q: filters.q }, "mentors.csv")} />}
      </div>

      <div className="flex gap-6 border-b border-gray-200 mb-6" role="tablist">
        {(["mentors", "applications"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParam("tab", t === "applications" ? "applications" : null)}
            className={`pb-3 text-sm font-semibold -mb-px border-b-2 transition-colors ${tab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t === "mentors" ? "Coaches" : "Applications"}
            {t === "applications" && !!pendingCount && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px]">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {tab === "applications" ? (
        <ApplicationsPanel />
      ) : (
        <>
          {/* Controls Bar: Search & Pill Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <SearchInput value={q} onChange={(v) => setParam("q", v)} placeholder="Search coach…" label="Search coaches" />
            <FilterPills label="Division" options={divisionTabs} value={divisionId} onChange={(v) => setParam("divisionId", v)} />
            <SelectFilter
              label="Status"
              value={status}
              onChange={(v) => setParam("status", v)}
              options={[{ label: "Any", value: "" }, ...Object.entries(STATUS_BADGE).map(([value, s]) => ({ value, label: s.label }))]}
            />
          </div>

          {mentors.isError ? (
            <ErrorState error={mentors.error} title="Couldn't load coaches" onRetry={() => mentors.refetch()} />
          ) : (
            <TableCard
              footer={
                mentors.data && (
                  <div className="px-4 pb-4">
                    <Pagination page={page} totalPages={mentors.data.meta.totalPages} total={mentors.data.meta.total} onPage={(p) => setParam("page", String(p))} disabled={mentors.isFetching} />
                  </div>
                )
              }
            >
              <thead>
                <tr className="border-b border-gray-100">
                  <th className={th}>Coach</th>
                  <th className={th}>Email</th>
                  <th className={th}>Division</th>
                  <th className={th}>Courses</th>
                  <th className={th}>Open reviews</th>
                  <th className={th}>Status</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100/80 ${mentors.isFetching && mentors.data ? "opacity-60" : ""}`}>
                {mentors.isPending ? (
                  <TableMessage colSpan={7}>Loading coaches…</TableMessage>
                ) : mentors.data.data.length === 0 ? (
                  <TableMessage colSpan={7}>No coaches found matching your criteria.</TableMessage>
                ) : (
                  mentors.data.data.map((m) => {
                    const divs = [...new Set(m.teaching.map((t) => t.division.name.replace(/ division$/i, "")))];
                    const attention = needsAttention(m);
                    return (
                      <tr key={m.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                        <td className={`${td} font-bold text-gray-800`}>
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span>{m.name}</span>
                            {attention && (
                              <AlertCircle className="w-3.5 h-3.5 text-amber-500 fill-amber-100 shrink-0" aria-label={m.teaching.length === 0 ? "No course access" : "Awaiting setup"} />
                            )}
                          </div>
                          <span className="block text-[11px] font-normal text-gray-400">Last sign-in {m.lastLoginAt ? formatDate(m.lastLoginAt) : "never"}</span>
                        </td>
                        <td className={`${td} text-gray-500 font-medium`}>{m.email}</td>
                        <td className={`${td} font-medium`}>
                          <span className={divs.length ? "text-gray-700" : "text-amber-600 font-semibold"}>{divs.length ? divs.join(", ") : "Not assigned"}</span>
                        </td>
                        <td className={`${td} font-medium`}>
                          {m.teaching.length ? (
                            <ul className="space-y-0.5">
                              {m.teaching.map((t) => (
                                <li key={`${t.course.id}:${t.division.id}`} className="text-gray-700 whitespace-nowrap">
                                  {t.course.title} <span className="text-gray-400">· {t.division.name.replace(/ division$/i, "")}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-amber-600 font-semibold">No access</span>
                          )}
                        </td>
                        <td className={`${td} text-gray-600`}>{formatNumber(m.openReviews)}</td>
                        <td className={td}>
                          <Badge className={STATUS_BADGE[m.status].badge}>{STATUS_BADGE[m.status].label}</Badge>
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setAccessName(m.name);
                                setParam("mentor", m.id, true);
                              }}
                              className="px-3 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg border border-gray-200 transition-colors whitespace-nowrap"
                            >
                              Course access
                            </button>
                            <Link href={`/admin/users/${m.id}`} className={linkBtn} aria-label={`View account of ${m.name}`}>
                              Account
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </TableCard>
          )}
        </>
      )}

      {accessFor && (
        <CourseAccessDialog
          mentorId={accessFor}
          mentorName={accessName ?? mentors.data?.data.find((m) => m.id === accessFor)?.name}
          onClose={() => {
            setAccessName(null);
            setParam("mentor", null, true);
          }}
        />
      )}
    </>
  );
}

