"use client";

/**
 * Learning activity of the programmes a Head Coach heads (GET /admin/activity,
 * activity.view): the backend returns only programme members' activity on the
 * programmes' courses (a shared coach's other programmes stay hidden).
 */
import { useState } from "react";
import { roleLabel } from "@/lib/auth/roles";
import { formatDateTime, personName } from "@/lib/format";
import { ACTIVITY_EVENT, ACTIVITY_LABEL } from "@/lib/programmes/programme-rules";
import { useActivityLog } from "@/lib/queries/programmes";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { TableCard, TableMessage, td, th } from "@/app/admin/components/adminUi";
import { FilterBar } from "@/app/components/ui/FilterBar";

const PAGE_SIZE = 25;
const TYPE_OPTIONS = Object.entries(ACTIVITY_LABEL).map(([value, label]) => ({ label, value }));

export default function ProgrammeActivity({ courseTitle }: { courseTitle: (courseId: string) => string | undefined }) {
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const log = useActivityLog({ page, limit: PAGE_SIZE, ...(type && { type }) }, true);
  if (log.isError) return <ErrorState error={log.error} title="Couldn't load the activity" onRetry={() => log.refetch()} />;
  const rows = log.data?.data ?? [];
  return (
    <>
      {/* Filter (owner 2026-11-25): "+ Add filter" and a chip. */}
      <FilterBar
        testId="programme-activity-filters"
        onClearAll={() => { setType(""); setPage(1); }}
        filters={[
          { key: "type", kind: "select", label: "Activity", value: type, onChange: (v) => { setType(v); setPage(1); }, options: TYPE_OPTIONS },
        ]}
      />
      <TableCard footer={log.data && <Pagination page={page} totalPages={log.data.meta.totalPages} total={log.data.meta.total} onPage={setPage} disabled={log.isFetching} />}>
        <thead className="bg-gray-50/60 border-b border-gray-100">
          <tr>
            <th className={th}>When</th>
            <th className={th}>Who</th>
            <th className={th}>Activity</th>
            <th className={th}>Course</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50" data-testid="programme-activity">
          {log.isPending ? (
            <TableMessage colSpan={4}>Loading…</TableMessage>
          ) : rows.length === 0 ? (
            <TableMessage colSpan={4}>No activity recorded yet.</TableMessage>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td className={`${td} text-gray-600 whitespace-nowrap`}>{formatDateTime(r.createdAt)}</td>
                <td className={td}>
                  <p className="font-semibold text-gray-800">{personName(r.user)}</p>
                  <p className="text-xs text-gray-500">
                    @{r.user.username} · {roleLabel(r.user.role)}
                  </p>
                </td>
                <td className={`${td} text-gray-600`}>{ACTIVITY_EVENT[r.type] ?? r.type}</td>
                <td className={`${td} text-gray-600`}>{r.courseId ? (courseTitle(r.courseId) ?? "A programme course") : "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
    </>
  );
}
