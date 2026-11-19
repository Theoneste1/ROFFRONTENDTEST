"use client";

/**
 * History (Test Management Phase 3; tests.review): the test's status changes, the mark-change log (who, which marking
 * and question, old → new, when, why) and the reviewers' decisions — newest first, paginated. All append-only in the
 * database.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { testMarkingApi, type HistoryMarkRow, type HistoryReviewRow, type HistoryStatusRow, type HistoryType } from "@/lib/api/test-marking";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { SUBMISSION_STATUS_LABEL } from "@/lib/test-management/submissions";
import { KIND_LABEL, REVIEW_ACTION_LABEL } from "@/lib/test-management/marking";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { TableCard, TableMessage, td, th } from "@/app/admin/components/adminUi";

const TYPES: ReadonlyArray<{ label: string; value: HistoryType }> = [
  { label: "Status changes", value: "status" },
  { label: "Mark changes", value: "marks" },
  { label: "Decisions", value: "reviews" },
];

export default function HistoryPanel({ testId }: { testId: string }) {
  const [type, setType] = useState<HistoryType>("status");
  const [page, setPage] = useState(1);
  const filters = { type, page, limit: 25 };
  const list = useQuery({
    queryKey: queryKeys.tests.markingHistory(testId, filters),
    queryFn: () => testMarkingApi.history(testId, filters),
    // Keep the previous page while the next one loads — never rows of another kind (their shapes differ).
    placeholderData: (prev, prevQuery) => ((prevQuery?.queryKey.at(-1) as { type?: HistoryType } | undefined)?.type === type ? prev : undefined),
  });
  const who = (s: { publicCode: string; student: { firstName: string; lastName: string } }) => (
    <><span className="font-semibold text-gray-900">{personName(s.student)}</span> <span className="font-mono text-gray-600">{s.publicCode}</span></>
  );
  return (
    <div className="space-y-4" data-testid="history-panel">
      <div>
        <h3 className="text-base font-bold text-slate-900">History</h3>
        <p className="mt-0.5 text-xs text-slate-700">Every status change, every mark change and every decision is kept and cannot be edited.</p>
      </div>
      <FilterPills label="History" options={[...TYPES]} value={type} onChange={(v) => { setType(v); setPage(1); }} />
      {list.isPending ? <LoadingBlock /> : list.isError ? <ErrorState error={list.error} title="Couldn't load the history" onRetry={() => list.refetch()} /> : (
        <>
          <TableCard>
            {type === "status" && (
              <>
                <thead><tr className="border-b border-gray-100"><th className={th}>When</th><th className={th}>Submission</th><th className={th}>Change</th><th className={th}>By</th></tr></thead>
                <tbody className="divide-y divide-gray-100/80" data-testid="history-rows">
                  {list.data.data.length === 0 ? <TableMessage colSpan={4}>Nothing yet.</TableMessage> : (list.data.data as HistoryStatusRow[]).map((h) => (
                    <tr key={h.id} className="text-xs">
                      <td className={`${td} whitespace-nowrap text-gray-700`}>{formatDateTime(h.createdAt)}</td>
                      <td className={td}>{who(h.submission)}</td>
                      <td className={`${td} text-gray-800`}>{h.fromStatus ? `${SUBMISSION_STATUS_LABEL[h.fromStatus]} → ` : ""}{SUBMISSION_STATUS_LABEL[h.toStatus]}{h.reason && <span className="block text-gray-600">“{h.reason}”</span>}</td>
                      <td className={`${td} text-gray-700`}>{h.actor ? personName(h.actor) : h.actorRole}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {type === "marks" && (
              <>
                <thead><tr className="border-b border-gray-100"><th className={th}>When</th><th className={th}>Submission</th><th className={th}>Marking</th><th className={th}>Question</th><th className={th}>Old → new</th><th className={th}>By</th></tr></thead>
                <tbody className="divide-y divide-gray-100/80" data-testid="history-rows">
                  {list.data.data.length === 0 ? <TableMessage colSpan={6}>Nothing yet.</TableMessage> : (list.data.data as HistoryMarkRow[]).map((c) => (
                    <tr key={c.id} className="text-xs">
                      <td className={`${td} whitespace-nowrap text-gray-700`}>{formatDateTime(c.createdAt)}</td>
                      <td className={td}>{who(c.submission)}</td>
                      <td className={`${td} text-gray-800`}>{KIND_LABEL[c.marking.kind]}<span className="block text-gray-600">{personName(c.marking.marker)}</span></td>
                      <td className={`${td} text-gray-800`}>{c.question ? `Q${c.question.order}` : "Total"}</td>
                      <td className={`${td} font-semibold text-gray-900`}>{c.oldMarks ?? "—"} → {c.newMarks ?? "—"}{c.reason && <span className="block font-normal text-gray-600">“{c.reason}”</span>}</td>
                      <td className={`${td} text-gray-700`}>{c.changedBy ? personName(c.changedBy) : c.changedByRole}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {type === "reviews" && (
              <>
                <thead><tr className="border-b border-gray-100"><th className={th}>When</th><th className={th}>Submission</th><th className={th}>Decision</th><th className={th}>By</th></tr></thead>
                <tbody className="divide-y divide-gray-100/80" data-testid="history-rows">
                  {list.data.data.length === 0 ? <TableMessage colSpan={4}>Nothing yet.</TableMessage> : (list.data.data as HistoryReviewRow[]).map((r) => (
                    <tr key={r.id} className="text-xs">
                      <td className={`${td} whitespace-nowrap text-gray-700`}>{formatDateTime(r.createdAt)}</td>
                      <td className={td}>{who(r.submission)}</td>
                      <td className={`${td} text-gray-800`}>{REVIEW_ACTION_LABEL[r.action]}{r.chosenKind && ` (${KIND_LABEL[r.chosenKind].toLowerCase()})`}{r.comment && <span className="block text-gray-600">“{r.comment}”</span>}</td>
                      <td className={`${td} text-gray-700`}>{r.actor ? personName(r.actor) : r.actorRole}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </TableCard>
          <Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
        </>
      )}
    </div>
  );
}
