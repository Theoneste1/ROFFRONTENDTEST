"use client";

/**
 * Bulk operations of every record type (`/admin/bulk`, capability bulkOperationsGeneric, users.bulkManage): each
 * operation with its progress (refreshed while one is running), the result of every record with the reason of each
 * failure or skip, and Cancel for one still waiting or running. `?type=` filters by record type; `?operation=` opens
 * one. Operations are started from the lists (schools, school claims, teacher and coach applications, users).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bulkApi, type BulkItemOutcome, type RecordOperation } from "@/lib/api/bulk";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime, personName } from "@/lib/format";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { ITEM_OUTCOME_FILTERS, OPERATION_STATUS_META, canCancel, isOperationActive, operationStatusLabel, progressPercent } from "@/lib/admin/bulk-users";
import {
  RECORD_TYPES,
  genericBulkAvailable,
  itemSummary,
  recordActionLabel,
  recordBulkError,
  recordItemCodeLabel,
  recordTypeLabel,
  recordTypeMeta,
} from "@/lib/admin/bulk-records";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, FilterPills, Notice, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";

const POLL_MS = 3000;
const TYPE_OPTIONS = [{ label: "All", value: "" }, ...Object.keys(RECORD_TYPES).map((t) => ({ label: recordTypeLabel(t), value: t }))];

export default function BulkRecordsClient() {
  const { permissionsStatus, can, retry: retrySession } = useSession();
  const caps = useBackendCapabilities();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const type = params.get("type") ?? "";
  const focus = params.get("operation");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(focus);
  const loading = caps.loading || permissionsStatus === "loading";
  const visible = !loading && permissionsStatus === "ready" && genericBulkAvailable(caps.detection, can);
  const filters = { ...(type && { entityType: type }), page, limit: 20 };
  const list = useQuery({
    queryKey: queryKeys.bulk.list(filters),
    queryFn: () => bulkApi.list(filters),
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
  const focusedOffPage = focus && list.data && !rows.some((r) => r.id === focus);
  return (
    <AdminPage
      title="Bulk operations"
      description="Actions applied to many records at once — schools, school claims, applications and accounts — with a result for every record. Start one from a list: tick records, or act on every match."
    >
      <div className="mb-6">
        <FilterPills
          label="Records"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(v) => {
            setPage(1);
            const q = new URLSearchParams();
            if (v) q.set("type", v);
            router.replace(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false });
          }}
        />
      </div>
      {focusedOffPage && (
        <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4">
          <OperationDetail id={focus} withHeader />
        </div>
      )}
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
          <tbody className="divide-y divide-gray-50" data-testid="bulk-record-operations">
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

function OperationRow({ op, open, onToggle }: { op: RecordOperation; open: boolean; onToggle: () => void }) {
  const meta = OPERATION_STATUS_META[op.status];
  return (
    <>
      <tr data-testid="bulk-record-operation">
        <td className={`${td} text-sm text-gray-800`}>
          {recordActionLabel(op.entityType, op.action)}
          <span className="block text-[11px] text-gray-600">{recordTypeLabel(op.entityType)}</span>
        </td>
        <td className={td}>
          <Badge className={meta?.badge ?? "bg-slate-100 text-slate-700"}>{operationStatusLabel(op.status)}</Badge>
        </td>
        <td className={`${td} text-xs text-gray-600 whitespace-nowrap`}>
          <ProgressBar percent={progressPercent(op)} />
          {op.succeeded} done · {op.failed} failed · {op.skipped} skipped / {op.total}
        </td>
        <td className={`${td} text-xs text-gray-600`}>{op.actor ? personName(op.actor) : "deleted account"}</td>
        <td className={`${td} text-[11px] text-gray-600 whitespace-nowrap`}>{formatDateTime(op.createdAt)}</td>
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

function OperationDetail({ id, withHeader }: { id: string; withHeader?: boolean }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<BulkItemOutcome | "">("");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const detail = useQuery({
    queryKey: queryKeys.bulk.detail(id),
    queryFn: () => bulkApi.get(id),
    refetchInterval: (q) => (q.state.data && isOperationActive(q.state.data) ? POLL_MS : false),
  });
  const active = detail.data ? isOperationActive(detail.data) : false;
  const filters = { ...(outcome && { outcome }), page, limit: 25 };
  const items = useQuery({
    queryKey: queryKeys.bulk.items(id, filters),
    queryFn: () => bulkApi.items(id, filters),
    placeholderData: keepPreviousData,
    refetchInterval: active ? POLL_MS : false,
  });
  // When the operation turns final, fetch the results once more so no record is left showing "waiting".
  const wasActive = useRef(active);
  const refetchItems = items.refetch;
  useEffect(() => {
    if (wasActive.current && !active) void refetchItems();
    wasActive.current = active;
  }, [active, refetchItems]);
  const entityType = detail.data?.entityType ?? "";
  const m = recordTypeMeta(entityType);
  const cancel = useMutation({
    mutationFn: () => bulkApi.cancel(id),
    onSuccess: () => {
      setNotice({ tone: "success", text: `Cancelled: ${m.plural} not yet processed are skipped; processed ones keep their result.` });
      void qc.invalidateQueries({ queryKey: queryKeys.bulk.all });
    },
    onError: (e) => {
      setNotice({ tone: "error", text: (isApiError(e) ? recordBulkError(entityType, e)?.text : null) ?? errorMessage(e) });
      void qc.invalidateQueries({ queryKey: queryKeys.bulk.all });
    },
  });

  if (detail.isPending) return <LoadingBlock />;
  if (detail.isError) return <ErrorState error={detail.error} title="Couldn't load the operation" onRetry={() => detail.refetch()} />;
  const op = detail.data;
  const meta = OPERATION_STATUS_META[op.status];
  return (
    <div className="space-y-3" data-testid="bulk-operation-detail">
      {withHeader && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-gray-800">
            {recordActionLabel(op.entityType, op.action)} · {recordTypeLabel(op.entityType)}
          </p>
          <Badge className={meta?.badge ?? "bg-slate-100 text-slate-700"}>{operationStatusLabel(op.status)}</Badge>
          <span className="text-xs text-gray-600">
            {op.succeeded} done · {op.failed} failed · {op.skipped} skipped / {op.total}
          </span>
        </div>
      )}
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
              if (window.confirm(`Cancel this operation? ${m.plural.charAt(0).toUpperCase() + m.plural.slice(1)} not yet processed will be skipped.`)) cancel.mutate();
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
              <tr className="text-left text-gray-500 uppercase tracking-wider text-[10px]">
                <th className="py-2 pr-4">{m.singular}</th>
                <th className="py-2 pr-4">Result</th>
                <th className="py-2 pr-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100" data-testid="bulk-operation-items">
              {items.isPending ? (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : (items.data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-500">
                    No {m.plural} with this result.
                  </td>
                </tr>
              ) : (
                items.data!.data.map((it) => {
                  const s = itemSummary(op.entityType, it);
                  return (
                    <tr key={it.entityId} data-testid="bulk-operation-item">
                      <td className="py-2 pr-4 text-gray-700">
                        {s ? (
                          s.href ? (
                            <Link href={s.href} className="hover:underline">
                              {s.title}
                            </Link>
                          ) : (
                            s.title
                          )
                        ) : (
                          <span className="text-gray-500">no longer exists</span>
                        )}
                        {s?.detail && <span className="block text-gray-500">{s.detail}</span>}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{it.outcome.toLowerCase()}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {[recordItemCodeLabel(it.code), it.message, it.stillBlockedBy.length ? `still blocked by: ${it.stillBlockedBy.join(", ")}` : ""].filter(Boolean).join(" — ")}
                      </td>
                    </tr>
                  );
                })
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
