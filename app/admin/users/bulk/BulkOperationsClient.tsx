"use client";

/**
 * Bulk operations (`/admin/users/bulk`, capability bulkUserOperations, users.bulkManage): every operation with its
 * progress (refreshed while one is running), the per-account results with the reason of each failure or skip, and
 * Cancel for an operation still waiting or running. Rules: lib/admin/bulk-users.ts.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminUser } from "@/lib/queries/admin";
import { bulkUsersApi, type BulkItemOutcome, type BulkOperation } from "@/lib/api/bulk-users";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import {
  ITEM_OUTCOME_FILTERS,
  OPERATION_STATUS_META,
  actionLabel,
  bulkAvailable,
  bulkErrorMessage,
  canCancel,
  delegationLabel,
  isOperationActive,
  itemCodeLabel,
  operationStatusLabel,
  progressPercent,
} from "@/lib/admin/bulk-users";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, FilterPills, Notice, TableCard, TableMessage, linkBtn, td, th } from "../../components/adminUi";

const POLL_MS = 3000;

export default function BulkOperationsClient() {
  const { permissionsStatus, can, retry: retrySession } = useSession();
  const caps = useBackendCapabilities();
  const params = useSearchParams();
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(params.get("operation"));
  const loading = caps.loading || permissionsStatus === "loading";
  const visible = !loading && permissionsStatus === "ready" && bulkAvailable(caps.detection, can);
  const list = useQuery({
    queryKey: queryKeys.bulkUsers.list({ page }),
    queryFn: () => bulkUsersApi.list({ page, limit: 20 }),
    enabled: visible,
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.data.some(isOperationActive) ? POLL_MS : false),
  });

  if (!visible) {
    return (
      <AdminPage title="Bulk operations">
        {loading && <LoadingBlock />}
        {!loading && permissionsStatus === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retrySession} />}
        {!loading && permissionsStatus === "ready" && <Notice tone="info">Bulk operations need a server that provides them and the users.bulkManage permission.</Notice>}
      </AdminPage>
    );
  }

  const rows = list.data?.data ?? [];
  return (
    <AdminPage
      title="Bulk operations"
      description="Actions applied to many accounts at once, with a result for every account. Start one from the Users page."
      actions={
        <Link href="/admin/users" className={linkBtn}>
          ← Users
        </Link>
      }
    >
      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the operations" onRetry={() => list.refetch()} />
      ) : (
        <TableCard footer={list.data && <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>Action</th>
              <th className={th}>Status</th>
              <th className={th}>Progress</th>
              <th className={th}>By</th>
              <th className={th}>Started</th>
              <th className={`${th} text-right`}>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="bulk-operations">
            {list.isPending ? (
              <TableMessage colSpan={6}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={6}>No bulk operations yet.</TableMessage>
            ) : (
              rows.map((op) => <OperationRow key={op.id} op={op} open={openId === op.id} onToggle={() => setOpenId(openId === op.id ? null : op.id)} />)
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}

function OperationRow({ op, open, onToggle }: { op: BulkOperation; open: boolean; onToggle: () => void }) {
  const meta = OPERATION_STATUS_META[op.status];
  return (
    <>
      <tr>
        <td className={`${td} text-sm text-gray-800`}>
          {actionLabel(op.action)}
          {op.params?.role && <span className="block text-[11px] text-gray-500">to {op.params.role}</span>}
          {op.params?.gradeLevel && <span className="block text-[11px] text-gray-500">to {op.params.gradeLevel}</span>}
          {op.params?.subject && <span className="block text-[11px] text-gray-500 truncate max-w-[220px]">“{op.params.subject}”</span>}
          {op.params?.permission && <span className="block text-[11px] text-gray-500">{delegationLabel(op.params.permission)}</span>}
        </td>
        <td className={td}>
          <Badge className={meta?.badge ?? "bg-slate-100 text-slate-700"}>{operationStatusLabel(op.status)}</Badge>
        </td>
        <td className={`${td} text-xs text-gray-600 whitespace-nowrap`}>
          <ProgressBar percent={progressPercent(op)} />
          {op.succeeded} done · {op.failed} failed · {op.skipped} skipped / {op.total}
        </td>
        <td className={`${td} text-xs text-gray-600`}>{op.actor ? personName(op.actor) : "deleted account"}</td>
        <td className={`${td} text-[11px] text-gray-500 whitespace-nowrap`}>{formatDateTime(op.createdAt)}</td>
        <td className={`${td} text-right`}>
          <button type="button" className={linkBtn} onClick={onToggle} aria-expanded={open}>
            {open ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="bg-gray-50/50 px-4 sm:px-6 py-4">
            <OperationDetail id={op.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <span className="block h-1.5 w-32 rounded bg-gray-200 mb-1" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-1.5 rounded bg-indigo-500" style={{ width: `${percent}%` }} />
    </span>
  );
}

function OperationDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<BulkItemOutcome | "">("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const detail = useQuery({
    queryKey: queryKeys.bulkUsers.detail(id),
    queryFn: () => bulkUsersApi.get(id),
    refetchInterval: (q) => (q.state.data && isOperationActive(q.state.data) ? POLL_MS : false),
  });
  const active = detail.data ? isOperationActive(detail.data) : false;
  const filters = { ...(outcome && { outcome }), page, limit: 25 };
  const items = useQuery({
    queryKey: queryKeys.bulkUsers.items(id, filters),
    queryFn: () => bulkUsersApi.items(id, filters),
    placeholderData: keepPreviousData,
    refetchInterval: active ? POLL_MS : false,
  });
  // When the operation turns final, fetch the results once more so no account is left showing "pending".
  const wasActive = useRef(active);
  const refetchItems = items.refetch;
  useEffect(() => {
    if (wasActive.current && !active) void refetchItems();
    wasActive.current = active;
  }, [active, refetchItems]);
  const cancel = useMutation({
    mutationFn: () => bulkUsersApi.cancel(id),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Cancelled: accounts not yet processed are skipped; processed ones keep their result." });
      void qc.invalidateQueries({ queryKey: queryKeys.bulkUsers.all });
    },
    onError: (e) => {
      setNotice({ tone: "error", text: (isApiError(e) ? bulkErrorMessage(e)?.text : null) ?? errorMessage(e) });
      void qc.invalidateQueries({ queryKey: queryKeys.bulkUsers.all });
    },
  });

  if (detail.isPending) return <LoadingBlock />;
  if (detail.isError) return <ErrorState error={detail.error} title="Couldn't load the operation" onRetry={() => detail.refetch()} />;
  const op = detail.data;
  return (
    <div className="space-y-3">
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
        <p>
          {op.reason && (
            <span className="block">
              <span className="font-semibold">Reason:</span> {op.reason}
            </span>
          )}
          {op.params?.teacherId && <TeacherLine teacherId={op.params.teacherId} permission={op.params.permission} />}
          <span className="block">
            {op.startedAt ? `Started ${formatDateTime(op.startedAt)}` : "Not started yet"}
            {op.finishedAt ? ` · finished ${formatDateTime(op.finishedAt)}` : ""}
            {typeof op.pending === "number" && active ? ` · ${op.pending} waiting` : ""}
          </span>
        </p>
        {canCancel(op) && (
          <button
            type="button"
            className="text-red-600 hover:text-red-800 font-medium text-xs"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm("Cancel this operation? Accounts not yet processed will be skipped.")) cancel.mutate();
            }}
          >
            Cancel operation
          </button>
        )}
      </div>
      <FilterPills
        label="Results"
        options={[...ITEM_OUTCOME_FILTERS]}
        value={outcome}
        onChange={(v) => {
          setOutcome(v);
          setPage(1);
        }}
      />
      {items.isError ? (
        <ErrorState error={items.error} title="Couldn't load the results" onRetry={() => items.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="py-2 pr-4">Account</th>
                <th className="py-2 pr-4">Result</th>
                <th className="py-2 pr-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.isPending ? (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : (items.data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-400">
                    No accounts with this result.
                  </td>
                </tr>
              ) : (
                items.data!.data.map((it) => (
                  <tr key={it.userId}>
                    <td className="py-2 pr-4 text-gray-700">
                      {it.user ? (
                        <Link href={`/admin/users/${it.userId}`} className="hover:underline">
                          {it.user.firstName} {it.user.lastName} <span className="text-gray-400">@{it.user.username}</span>
                        </Link>
                      ) : (
                        <span className="text-gray-400">deleted account</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{it.outcome.toLowerCase()}</td>
                    <td className="py-2 pr-4 text-gray-500">
                      {[itemCodeLabel(it.code), it.message, it.stillBlockedBy.length ? `still blocked by: ${it.stillBlockedBy.join(", ")}` : ""].filter(Boolean).join(" — ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {items.data && items.data.meta.totalPages > 1 && (
            <Pagination page={page} totalPages={items.data.meta.totalPages} total={items.data.meta.total} onPage={setPage} disabled={items.isFetching} />
          )}
        </div>
      )}
    </div>
  );
}

/** Teacher actions: which teacher (name and @username when the account can be read) and which permission. */
function TeacherLine({ teacherId, permission }: { teacherId: string; permission?: string }) {
  const teacher = useAdminUser(teacherId);
  const t = teacher.data;
  return (
    <span className="block" data-testid="bulk-operation-teacher">
      <span className="font-semibold">Teacher:</span> {t ? `${t.firstName} ${t.lastName} @${t.username}` : teacherId}
      {permission && (
        <>
          {" · "}
          <span className="font-semibold">Permission:</span> {delegationLabel(permission)}
        </>
      )}
    </span>
  );
}
