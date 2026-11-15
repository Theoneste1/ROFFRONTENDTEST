"use client";

/**
 * Notification delivery log (`/admin/notification-deliveries`, email.bulkSend): the e-mails of the
 * decision notifications (school verified, teacher / coach application approved, permissions
 * granted), filtered by status and type, with Retry for a FAILED delivery. The message body is
 * never shown (the backend doesn't return it). Rules: lib/admin/notification-deliveries.ts.
 */
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationDeliveriesApi, type DeliveryStatus, type NotificationDelivery } from "@/lib/api/notification-deliveries";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatDateTime } from "@/lib/format";
import {
  DELIVERY_STATUS_FILTERS,
  DELIVERY_STATUS_META,
  DELIVERY_TYPE_FILTERS,
  canRetryDelivery,
  deliveryEntityLabel,
  deliveryLogMode,
  deliveryQuery,
  deliveryStatusLabel,
  deliveryTypeLabel,
  retryErrorMessage,
} from "@/lib/admin/notification-deliveries";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, FilterPills, Notice, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";

export default function DeliveryLog() {
  const { permissionsStatus, can, retry: retrySession } = useSession();
  const caps = useBackendCapabilities();
  const mode = deliveryLogMode({ detection: caps.detection, detectionLoading: caps.loading, permissionsStatus, can });
  const visible = mode === "visible";
  const qc = useQueryClient();
  const [status, setStatus] = useState<DeliveryStatus | "">("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const filters = deliveryQuery(status, type, page);
  const list = useQuery({
    queryKey: queryKeys.notificationDeliveries.list(filters),
    queryFn: () => notificationDeliveriesApi.list(filters),
    enabled: visible,
    placeholderData: keepPreviousData,
  });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.notificationDeliveries.all });
  const retry = useMutation({
    mutationFn: (d: NotificationDelivery) => notificationDeliveriesApi.retry(d.id),
    onSuccess: (_row, d) => {
      setNotice({ tone: "success", text: `Delivery to ${d.recipientEmail} queued again; it will be sent shortly.` });
      void refresh();
    },
    onError: (e) => {
      const known = isApiError(e) ? retryErrorMessage(e) : null;
      if (known) void refresh();
      setNotice({ tone: "error", text: known ?? errorMessage(e) });
    },
  });

  if (!visible) {
    return (
      <AdminPage title="Notification deliveries">
        {mode === "loading" && <LoadingBlock />}
        {mode === "error" && <ErrorState error={null} title="Couldn't load your permissions" onRetry={retrySession} />}
        {mode === "unsupported" && <Notice tone="info">This server does not provide a notification delivery log yet.</Notice>}
        {mode === "forbidden" && <Notice tone="info">The delivery log needs the email.bulkSend permission.</Notice>}
      </AdminPage>
    );
  }

  const rows = list.data?.data ?? [];
  const notFound = list.isError && isApiError(list.error) && list.error.status === 404;
  return (
    <AdminPage
      title="Notification deliveries"
      description="E-mails sent after an Administrator's decision: school verified, application approved, permissions granted. A failed e-mail never undoes the decision; retry it here."
    >
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <FilterPills
          label="Status"
          options={[...DELIVERY_STATUS_FILTERS]}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <SelectFilter
          label="Type"
          value={type}
          options={[...DELIVERY_TYPE_FILTERS]}
          onChange={(v) => {
            setType(v);
            setPage(1);
          }}
        />
      </div>
      {notFound ? (
        <Notice tone="info">This server doesn&apos;t have the notification delivery log yet.</Notice>
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the deliveries" onRetry={() => list.refetch()} />
      ) : (
        <TableCard footer={list.data && <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>Type</th>
              <th className={th}>Recipient</th>
              <th className={th}>Related item</th>
              <th className={th}>Status</th>
              <th className={th}>Attempts</th>
              <th className={th}>Last error</th>
              <th className={th}>Times</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="notification-deliveries">
            {list.isPending ? (
              <TableMessage colSpan={8}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={8}>No deliveries match these filters.</TableMessage>
            ) : (
              rows.map((d) => {
                const meta = DELIVERY_STATUS_META[d.status];
                const retrying = retry.isPending && retry.variables?.id === d.id;
                return (
                  <tr key={d.id}>
                    <td className={`${td} text-sm text-gray-800`}>
                      {deliveryTypeLabel(d.type)}
                      <span className="block text-[11px] text-gray-400 font-mono">{d.type}</span>
                    </td>
                    <td className={`${td} text-sm text-gray-700 break-all`}>
                      {d.recipientEmail}
                      {!d.recipientUserId && <span className="block text-[11px] text-gray-400">no account (e-mail only)</span>}
                    </td>
                    <td className={`${td} text-xs text-gray-600`} title={`${d.entityType} ${d.entityId}`}>
                      {deliveryEntityLabel(d)}
                    </td>
                    <td className={td}>
                      <Badge className={meta?.badge ?? "bg-slate-100 text-slate-700"}>{deliveryStatusLabel(d.status)}</Badge>
                    </td>
                    <td className={`${td} text-sm text-gray-700`}>{d.attempts}</td>
                    <td className={`${td} text-xs text-red-700 max-w-[260px] break-words`}>{d.lastError || <span className="text-gray-300">—</span>}</td>
                    <td className={`${td} text-[11px] text-gray-500 whitespace-nowrap`}>
                      <span className="block">Queued {formatDateTime(d.createdAt)}</span>
                      {d.sentAt && <span className="block">Sent {formatDateTime(d.sentAt)}</span>}
                      {!d.sentAt && d.nextAttemptAt && <span className="block">Next try {formatDateTime(d.nextAttemptAt)}</span>}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {canRetryDelivery(d) && (
                        <button type="button" className={`${linkBtn} inline-flex items-center gap-1`} disabled={retry.isPending} onClick={() => retry.mutate(d)}>
                          {retrying && <Spinner className="h-3 w-3" />}
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
