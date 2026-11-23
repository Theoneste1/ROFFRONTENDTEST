"use client";

/** Mailings sent: status, audience and delivery counts (refreshed while one is waiting or sending); cancel while queued. */
import { useState } from "react";
import Link from "next/link";
import { useCancelMailing, useMailings } from "@/lib/queries/subscribers";
import type { Mailing } from "@/lib/api/subscribers";
import { MAILING_STATUS_LABEL, audienceSummary, mailingCancellable, type MailingStatus } from "@/lib/subscribers/rules";
import { countryName } from "@/lib/schools/countries";
import { formatDateTime } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, ConfirmDialog, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";

const BADGE: Record<MailingStatus, string> = {
  QUEUED: "bg-amber-50 text-amber-700",
  SENDING: "bg-brand-50 text-brand",
  SENT: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default function MailingHistory({ onNotice }: { onNotice: (tone: "success" | "error" | "info", text: string) => void }) {
  const [page, setPage] = useState(1);
  const mailings = useMailings(page);
  const cancel = useCancelMailing();
  const [cancelling, setCancelling] = useState<Mailing | null>(null);

  if (mailings.isError) return <ErrorState error={mailings.error} title="Couldn't load the mailings" onRetry={() => mailings.refetch()} />;
  return (
    <>
      <TableCard
        footer={mailings.data && (
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={mailings.data.meta.totalPages} total={mailings.data.meta.total} onPage={setPage} disabled={mailings.isFetching} />
          </div>
        )}
      >
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>Subject</th>
            <th className={th}>Audience</th>
            <th className={th}>Status</th>
            <th className={th}>Recipients</th>
            <th className={th}>Sent</th>
            <th className={th}>Failed</th>
            <th className={th}>Created</th>
            <th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100/80" data-testid="mailing-rows">
          {mailings.isPending ? (
            <TableMessage colSpan={8}>Loading mailings…</TableMessage>
          ) : mailings.data.data.length === 0 ? (
            <TableMessage colSpan={8}>No mailing has been sent yet. Use &quot;Send an update&quot; to write the first one.</TableMessage>
          ) : (
            mailings.data.data.map((m) => (
              <tr key={m.id} className="text-xs hover:bg-gray-50/60" data-testid="mailing-row">
                <td className={`${td} font-semibold text-gray-800 max-w-[280px] break-words`}>{m.subject}</td>
                <td className={`${td} text-gray-600 max-w-[260px]`}>{audienceSummary(m.audience, countryName)}</td>
                <td className={td}>
                  <Badge className={BADGE[m.status]}>{MAILING_STATUS_LABEL[m.status]}</Badge>
                  {m.status === "QUEUED" && m.sendsAfter && <span className="block mt-1 text-[11px] text-gray-500">Starts {formatDateTime(m.sendsAfter)}</span>}
                </td>
                <td className={`${td} text-gray-700`} data-testid="mailing-recipients-count">
                  {m.recipientCount.toLocaleString()}
                  {m.cancelledCount > 0 && <span className="block text-[11px] text-gray-500">{m.cancelledCount.toLocaleString()} withdrawn</span>}
                </td>
                <td className={`${td} text-gray-700`}>{m.sentCount.toLocaleString()}</td>
                <td className={`${td} ${m.failedCount ? "text-red-700" : "text-gray-700"}`}>{m.failedCount.toLocaleString()}</td>
                <td className={`${td} text-gray-600 whitespace-nowrap`}>
                  {formatDateTime(m.createdAt)}
                  <span className="block text-[11px] text-gray-500">by {`${m.createdBy.firstName} ${m.createdBy.lastName}`.trim() || m.createdBy.username}</span>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {mailingCancellable(m.status) && (
                    <button type="button" className="text-red-600 hover:text-red-800 font-medium text-xs" onClick={() => setCancelling(m)}>Cancel</button>
                  )}
                  {m.failedCount > 0 && m.emailJobId && (
                    <Link className={`${linkBtn} block mt-1`} href={`/admin/email/jobs/${m.emailJobId}`}>Delivery details</Link>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
      {cancelling && (
        <ConfirmDialog
          title="Cancel this mailing?"
          body={<>E-mails of &quot;{cancelling.subject}&quot; that have not been sent yet are withdrawn. E-mails already sent cannot be taken back.</>}
          confirmLabel="Cancel the mailing"
          tone="danger"
          onConfirm={async () => {
            const r = await cancel.mutateAsync(cancelling.id);
            onNotice("success", `The mailing was cancelled: ${(r.withdrawn ?? 0).toLocaleString()} e-mail(s) withdrawn, ${r.sentCount.toLocaleString()} already sent.`);
          }}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  );
}
