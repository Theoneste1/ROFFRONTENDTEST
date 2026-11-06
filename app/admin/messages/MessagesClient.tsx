"use client";

/**
 * Messages sent through the public homepage contact form
 * (GET/PATCH /admin/contact-messages). Every message is stored, so it is
 * readable here even when no support e-mail is configured in Settings.
 */
import { useState } from "react";
import { useContactMessages, useSetContactMessageStatus } from "@/lib/queries/admin";
import type { ContactMessage, ContactMessageStatus } from "@/lib/api/admin";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/api/errors";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, FilterPills, Notice, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";

const STATUS: Record<ContactMessageStatus, { label: string; badge: string }> = {
  NEW: { label: "New", badge: "bg-amber-50 text-amber-700" },
  HANDLED: { label: "Handled", badge: "bg-emerald-50 text-emerald-700" },
};

function MessageRow({ m, onNotice }: { m: ContactMessage; onNotice: (tone: "success" | "error", text: string) => void }) {
  const [open, setOpen] = useState(false);
  const setStatus = useSetContactMessageStatus();
  const next: ContactMessageStatus = m.status === "NEW" ? "HANDLED" : "NEW";

  async function toggle() {
    try {
      await setStatus.mutateAsync({ id: m.id, status: next });
      onNotice("success", next === "HANDLED" ? `Message from ${m.fullName} marked as handled.` : `Message from ${m.fullName} marked as new again.`);
    } catch (err) {
      onNotice("error", errorMessage(err));
    }
  }

  return (
    <>
      <tr className="text-xs hover:bg-gray-50/60" data-testid="contact-message">
        <td className={`${td} max-w-[340px]`}>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-left">
            <span className="block font-semibold text-gray-800 break-words">{m.subject}</span>
            <span className="block text-gray-500 break-words">{open ? "Hide message" : m.message.length > 90 ? `${m.message.slice(0, 90)}…` : m.message}</span>
          </button>
        </td>
        <td className={`${td} text-gray-700`}>
          <span className="block font-medium">{m.fullName}</span>
          <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`} className="text-indigo-600 hover:underline break-all">
            {m.email}
          </a>
        </td>
        <td className={`${td} text-gray-500 whitespace-nowrap`}>{formatDateTime(m.createdAt)}</td>
        <td className={`${td} text-gray-500 whitespace-nowrap`}>{m.notification === "QUEUED" ? "E-mail queued" : "No support e-mail set"}</td>
        <td className={td}>
          <Badge className={STATUS[m.status].badge}>{STATUS[m.status].label}</Badge>
        </td>
        <td className={`${td} whitespace-nowrap`}>
          <button type="button" onClick={toggle} disabled={setStatus.isPending} className={`${linkBtn} disabled:opacity-50`}>
            {setStatus.isPending ? "Saving…" : next === "HANDLED" ? "Mark handled" : "Mark as new"}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50/60">
          <td colSpan={6} className="px-4 sm:px-6 py-4">
            <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{m.message}</p>
            {m.handledAt && <p className="mt-2 text-xs text-gray-400">Handled {formatDateTime(m.handledAt)}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function MessagesClient() {
  const [status, setStatus] = useState<"" | ContactMessageStatus>("NEW");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const messages = useContactMessages({ status: status || undefined, page, limit: 20 });
  const newCount = messages.data?.newCount;

  return (
    <AdminPage title="Messages" description="Messages sent through the contact form on the public homepage. Reply by e-mail, then mark them as handled.">
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FilterPills
          label="Message status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { label: "New", value: "NEW", count: newCount },
            { label: "Handled", value: "HANDLED" },
            { label: "All", value: "" },
          ]}
        />
      </div>
      {messages.isError ? (
        <ErrorState error={messages.error} title="Couldn't load messages" onRetry={() => messages.refetch()} />
      ) : (
        <TableCard
          footer={
            messages.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={messages.data.meta.totalPages} total={messages.data.meta.total} onPage={setPage} disabled={messages.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Message</th>
              <th className={th}>From</th>
              <th className={th}>Received</th>
              <th className={th}>Notification</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${messages.isFetching && messages.data ? "opacity-60" : ""}`}>
            {messages.isPending ? (
              <TableMessage colSpan={6}>Loading messages…</TableMessage>
            ) : messages.data.data.length === 0 ? (
              <TableMessage colSpan={6}>{status === "NEW" ? "No new messages." : "No messages."}</TableMessage>
            ) : (
              messages.data.data.map((m) => <MessageRow key={m.id} m={m} onNotice={(tone, text) => setNotice({ tone, text })} />)
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
