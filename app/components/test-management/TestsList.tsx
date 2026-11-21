"use client";

/**
 * Tests list (`/admin/tests` for Administrators, `/mentor/tests` for Head Coaches — the backend lists only the subjects
 * a Head Coach heads). Filters: subject, division, status, title search; status badges; pagination.
 */
import { useState } from "react";
import Link from "next/link";
import { BarChart3, Plus } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { testsApi, type TestDivision, type TestFilters, type TestStatus } from "@/lib/api/tests";
import { useSession } from "@/lib/auth/session";
import { actionAllowed } from "@/lib/auth/navigation";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import { DIVISION_LABEL, DIVISION_OPTIONS, TESTS_MANAGE } from "@/lib/test-management/rules";
import { TESTS_VIEW_RESULTS, resultsTabVisible } from "@/lib/test-management/results";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame, FilterPills } from "@/app/components/ui/PageFrame";
import { SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, td, th } from "@/app/admin/components/adminUi";
import { StatusBadge, TestsGate, useTestSubjects } from "./shared";

const STATUS_PILLS: { label: string; value: "" | TestStatus }[] = [
  { label: "All", value: "" },
  { label: "Drafts", value: "DRAFT" },
  { label: "Published", value: "PUBLISHED" },
];

export default function TestsList({ base, headCoach }: { base: string; headCoach?: boolean }) {
  return (
    <TestsGate title="Tests">
      <List base={base} headCoach={headCoach} />
    </TestsGate>
  );
}

function List({ base, headCoach }: { base: string; headCoach?: boolean }) {
  const { can, permissionsStatus } = useSession();
  const subjects = useTestSubjects();
  const [subjectId, setSubjectId] = useState("");
  const [division, setDivision] = useState<"" | TestDivision>("");
  const [status, setStatus] = useState<"" | TestStatus>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const filters: TestFilters = { subjectId: subjectId || undefined, division: division || undefined, status: status || undefined, q: q || undefined, page, limit: 20 };
  const list = useQuery({ queryKey: queryKeys.tests.list({ ...filters }), queryFn: () => testsApi.list(filters), placeholderData: keepPreviousData });
  const canManage = actionAllowed(TESTS_MANAGE, permissionsStatus, can);
  const { detection } = useBackendCapabilities();
  const showReports = resultsTabVisible(detection, permissionsStatus === "ready" && can(TESTS_VIEW_RESULTS));
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <PageFrame
      title="Tests"
      description={headCoach ? "Tests of the subjects you head: details, questions, the paper, the marking guide and markers." : "Tests of every subject: details, questions, the paper, the marking guide and markers."}
      actions={(canManage || showReports) && (
        <>
          {/* Phase 4: the reporting overview (capability testResults, tests.viewResults). Reached from here and from the
              dashboard widget rather than the menu, which is already full for Administrators. */}
          {showReports && (
            <Link href={`${base.replace(/\/tests$/, "")}/test-reports`} className={btnSecondary} data-testid="test-reports-link">
              <BarChart3 className="h-4 w-4" aria-hidden="true" /> Test reports
            </Link>
          )}
          {canManage && (
            <Link href={`${base}/new`} className={btnPrimary} data-testid="new-test">
              <Plus className="h-4 w-4" aria-hidden="true" /> New test
            </Link>
          )}
        </>
      )}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterPills label="Status" options={STATUS_PILLS} value={status} onChange={reset(setStatus)} />
        <SelectFilter label="Subject" value={subjectId} onChange={reset(setSubjectId)}
          options={[{ label: "All subjects", value: "" }, ...(subjects.data ?? []).map((s) => ({ label: s.name, value: s.id }))]} />
        <SelectFilter label="Division" value={division} onChange={(v) => reset(setDivision)(v as "" | TestDivision)}
          options={[{ label: "Any", value: "" }, ...DIVISION_OPTIONS.map((o) => ({ label: o.label, value: o.value }))]} />
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Search titles" label="Search tests" />
      </div>
      {list.isPending ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the tests" onRetry={() => list.refetch()} />
      ) : (
        <>
          <TableCard>
            <thead>
              <tr className="border-b border-gray-100">
                <th className={th}>Test</th>
                <th className={th}>Subject</th>
                <th className={th}>Division</th>
                <th className={th}>Opens</th>
                <th className={th}>Closes</th>
                <th className={th}>Marks</th>
                <th className={th}>Files</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80" data-testid="tests-list">
              {list.data.data.length === 0 ? (
                <TableMessage colSpan={8}>{status || subjectId || division || q ? "No test matches these filters." : "No tests yet."}</TableMessage>
              ) : (
                list.data.data.map((t) => (
                  <tr key={t.id} className="text-xs hover:bg-gray-50/60" data-testid={`test-row-${t.id}`}>
                    <td className={`${td} font-semibold text-gray-900`}>
                      <Link href={`${base}/${t.id}`} className="text-indigo-700 hover:text-indigo-900 hover:underline">{t.title}</Link>
                    </td>
                    <td className={`${td} text-gray-700`}>{t.subject.name}</td>
                    <td className={`${td} text-gray-700`}>{DIVISION_LABEL[t.division]}</td>
                    <td className={`${td} text-gray-700 whitespace-nowrap`}>{formatDateTime(t.opensAt)}</td>
                    <td className={`${td} text-gray-700 whitespace-nowrap`}>
                      {formatDateTime(t.closesAt)}
                      {t.deadlineMoved && <span className="ml-1 text-[11px] text-amber-800">(moved)</span>}
                    </td>
                    <td className={`${td} text-gray-700 whitespace-nowrap`}>
                      {t.maxMarks}
                      {t.questionCount > 0 && (
                        <span className={`ml-1 text-[11px] ${t.questionsComplete ? "text-gray-600" : "text-amber-800"}`}>
                          ({t.questionCount} q · {t.questionMarksTotal}/{t.maxMarks})
                        </span>
                      )}
                    </td>
                    <td className={`${td} text-gray-700 whitespace-nowrap`}>
                      {[t.files.paper && "Paper", t.files.markingGuide && "Guide"].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={td}><StatusBadge status={t.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
    </PageFrame>
  );
}
