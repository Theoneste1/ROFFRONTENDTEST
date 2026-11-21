"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { canRetryJob, emailErrorMessage, isJobRunning, type EmailDeliveryStatus } from "@/lib/admin-ops/email";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { useEmailDeliveries, useEmailJob, useRetryEmailJob } from "@/lib/queries/admin-ops";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, FilterPills, MetricCard, Notice, RequirePermission, TableCard, TableMessage, btnPrimary, td, th } from "../../../components/adminUi";
import { DeliveryStatusBadge, JobStatusBadge } from "../../emailUi";

const FILTERS: { label: string; value: "" | EmailDeliveryStatus }[] = [
  { label: "All", value: "" },
  { label: "Failed", value: "FAILED" },
  { label: "Pending", value: "PENDING" },
  { label: "Sent", value: "SENT" },
];

export default function EmailJobClient({ jobId }: { jobId: string }) {
  return (
    <RequirePermission permission="email.bulkSend" title="E-mail job">
      <EmailJob jobId={jobId} />
    </RequirePermission>
  );
}

function EmailJob({ jobId }: { jobId: string }) {
  const params = useSearchParams();
  const sent = params.get("sent");
  const dryRun = params.get("dry") === "1";
  const job = useEmailJob(jobId);
  const [status, setStatus] = useState<"" | EmailDeliveryStatus>("");
  const [page, setPage] = useState(1);
  const running = !!job.data && isJobRunning(job.data.status);
  const progress = job.data ? `${job.data.status}:${job.data.sentCount}:${job.data.failedCount}` : "";
  const deliveries = useEmailDeliveries(jobId, { status: status || undefined, page, limit: 25 }, running, progress, job.isSuccess);
  const retry = useRetryEmailJob(jobId);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const back = (
    <Link href="/admin/email" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All e-mail
    </Link>
  );

  if (job.isPending) return <AdminPage title="E-mail job">{back}<LoadingBlock /></AdminPage>;
  if (job.isError)
    return (
      <AdminPage title="E-mail job">
        {back}
        <ErrorState error={job.error} title={isApiError(job.error) && job.error.status === 404 ? "E-mail job not found" : "Couldn't load this e-mail job"} onRetry={() => job.refetch()} />
      </AdminPage>
    );

  const j = job.data;
  const pending = Math.max(0, j.totalRecipients - j.sentCount - j.failedCount);

  function onRetry() {
    setNotice(null);
    retry.mutate(undefined, {
      onSuccess: (r) => setNotice({ tone: "success", text: `${formatNumber(r.requeued)} failed ${r.requeued === 1 ? "delivery was" : "deliveries were"} queued again.` }),
      onError: (e) => setNotice({ tone: "error", text: emailErrorMessage(e) ?? errorMessage(e) }),
    });
  }

  return (
    <AdminPage
      title={j.subject}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <JobStatusBadge status={j.status} /> Created {formatDateTime(j.createdAt)}
          {j.createdBy ? ` by @${j.createdBy.username}` : ""}
          {j.completedAt ? ` · finished ${formatDateTime(j.completedAt)}` : ""}
        </span>
      }
      actions={
        canRetryJob(j) && (
          <button type="button" className={btnPrimary} onClick={onRetry} disabled={retry.isPending}>
            {retry.isPending ? <Spinner className="h-3.5 w-3.5 !text-white" /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
            Retry failed deliveries
          </button>
        )
      }
    >
      {back}
      {sent === "new" && <Notice tone="success">The e-mail was queued. Deliveries are sent in the background; this page updates by itself.</Notice>}
      {sent === "existing" && <Notice tone="info">This e-mail had already been queued: it was not sent a second time.</Notice>}
      {dryRun && <Notice tone="info">The server is in dry-run mode (no e-mail provider configured): messages are recorded, not delivered.</Notice>}
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="email-job-counts">
        <MetricCard label="Recipients" value={formatNumber(j.totalRecipients)} />
        <MetricCard label="Sent" value={formatNumber(j.sentCount)} />
        <MetricCard label="Failed" value={formatNumber(j.failedCount)} />
        <MetricCard label="Pending" value={formatNumber(pending)} subtext={running ? "Sending…" : undefined} />
      </div>

      <div className="mb-4">
        <FilterPills
          label="Delivery status"
          options={FILTERS}
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
      </div>

      {deliveries.isError ? (
        <ErrorState error={deliveries.error} title="Couldn't load the deliveries" onRetry={() => deliveries.refetch()} />
      ) : (
        <TableCard
          footer={
            deliveries.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={deliveries.data.meta.totalPages} total={deliveries.data.meta.total} onPage={setPage} disabled={deliveries.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Recipient</th>
              <th className={th}>Status</th>
              <th className={th}>Attempts</th>
              <th className={th}>Last attempt</th>
              <th className={th}>Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="email-deliveries">
            {deliveries.isPending ? (
              <TableMessage colSpan={5}>Loading deliveries…</TableMessage>
            ) : deliveries.data.data.length === 0 ? (
              <TableMessage colSpan={5}>No deliveries match this filter.</TableMessage>
            ) : (
              deliveries.data.data.map((d) => (
                <tr key={d.id} className="text-xs" data-testid="email-delivery-row">
                  <td className={`${td} font-medium text-gray-800 break-all`}>{d.recipientEmail}</td>
                  <td className={td}>
                    <DeliveryStatusBadge status={d.status} />
                  </td>
                  <td className={td}>{d.attempts}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{d.attemptedAt ? formatDateTime(d.attemptedAt) : "—"}</td>
                  <td className={`${td} text-red-600 max-w-[320px] break-words`}>{d.errorMessage ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
