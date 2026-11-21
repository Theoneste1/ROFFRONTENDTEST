"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFailedDeliveries, useRetryDelivery } from "@/lib/queries/admin-ops";
import type { DeliveryKind } from "@/lib/api/admin-ops";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Notice, RequirePermission, TableCard, TableMessage, linkBtn, td, th } from "../../components/adminUi";
import { failedDeliveryUnavailable, retryOutcome } from "@/lib/admin-ops/failed-deliveries";

const KINDS: { value: "" | DeliveryKind; label: string }[] = [
  { value: "", label: "All e-mails" },
  { value: "TRANSACTIONAL", label: "Account e-mails" },
  { value: "BULK", label: "Bulk e-mails" },
];

/** Failed e-mail deliveries of every kind (GET /admin/email/deliveries?status=FAILED), with a retry per delivery. */
export default function FailedDeliveriesClient() {
  return (
    <RequirePermission permission="email.bulkSend" title="Failed e-mails">
      <FailedDeliveries />
    </RequirePermission>
  );
}

function FailedDeliveries() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const kind = (params.get("kind") ?? "") as "" | DeliveryKind;
  const list = useFailedDeliveries({ page, limit: 20, ...(kind && { kind }) });
  const retry = useRetryDelivery();
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const go = (next: { page?: number; kind?: string }) => {
    const q = new URLSearchParams();
    const k = next.kind ?? kind;
    if (k) q.set("kind", k);
    if ((next.page ?? 1) > 1) q.set("page", String(next.page));
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  async function onRetry(id: string, to: string) {
    setMessage(null);
    try {
      await retry.mutateAsync(id);
      setMessage(retryOutcome(null, to));
    } catch (e) {
      setMessage(retryOutcome(e, to) ?? { tone: "error", text: errorMessage(e, "Couldn't retry this e-mail.") });
    }
  }

  return (
    <AdminPage
      title="Failed e-mails"
      description="E-mails that could not be delivered: account e-mails (invitations, activation and password-reset links, notices) and bulk e-mails."
      actions={
        <Link href="/admin/email" className={linkBtn}>
          Bulk e-mail jobs
        </Link>
      }
    >
      {message && (
        <Notice tone={message.tone} onClose={() => setMessage(null)}>
          {message.text}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Kind of e-mail">
        {KINDS.map((k) => (
          <button
            key={k.value || "all"}
            type="button"
            aria-pressed={kind === k.value}
            onClick={() => go({ kind: k.value, page: 1 })}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${kind === k.value ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
          >
            {k.label}
          </button>
        ))}
      </div>
      {list.isError && failedDeliveryUnavailable(list.error) ? (
        <Notice tone="info">This server cannot list account e-mails yet. Bulk e-mail failures can be retried from their job.</Notice>
      ) : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the failed e-mails" onRetry={() => list.refetch()} />
      ) : (
        <TableCard
          footer={
            list.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={(p) => go({ page: p })} disabled={list.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Recipient</th>
              <th className={th}>Subject</th>
              <th className={th}>Kind</th>
              <th className={th}>Attempts</th>
              <th className={th}>Error</th>
              <th className={th}>Last attempt</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="failed-deliveries">
            {list.isPending ? (
              <TableMessage colSpan={7}>Loading failed e-mails…</TableMessage>
            ) : list.data.data.length === 0 ? (
              <TableMessage colSpan={7}>No failed e-mails.</TableMessage>
            ) : (
              list.data.data.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50/60 text-xs" data-testid="failed-delivery-row">
                  <td className={`${td} font-semibold text-gray-800 break-all`}>{d.recipientEmail}</td>
                  <td className={`${td} max-w-[240px] break-words`}>{d.subject ?? "—"}</td>
                  <td className={td}>
                    {d.kind === "BULK" && d.jobId ? (
                      <Link className={linkBtn} href={`/admin/email/jobs/${d.jobId}`}>
                        Bulk
                      </Link>
                    ) : d.kind === "BULK" ? (
                      "Bulk"
                    ) : (
                      "Account"
                    )}
                  </td>
                  <td className={td}>{d.attempts}</td>
                  <td className={`${td} text-red-600 max-w-[260px] break-words`}>{d.errorMessage ?? "—"}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{d.attemptedAt ? formatDateTime(d.attemptedAt) : "—"}</td>
                  <td className={td}>
                    <button type="button" className={linkBtn} disabled={retry.isPending} onClick={() => void onRetry(d.id, d.recipientEmail)}>
                      Retry
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
