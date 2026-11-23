"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MailPlus, Newspaper } from "lucide-react";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useSession } from "@/lib/auth/session";
import { subscribersSupported, SUBSCRIBERS_PERMISSION } from "@/lib/subscribers/rules";
import { useEmailJobs } from "@/lib/queries/admin-ops";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Notice, RequirePermission, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../components/adminUi";
import { JobStatusBadge } from "./emailUi";
import SendingTodayPanel from "./SendingTodayPanel";
import { emailBudgetSupported } from "@/lib/admin-ops/email-budget";

/** Bulk e-mail jobs (`GET /admin/email/jobs`), newest first, with their progress counters. */
export default function EmailJobsClient() {
  return (
    <RequirePermission permission="email.bulkSend" title="E-mail">
      <EmailJobs />
    </RequirePermission>
  );
}

function EmailJobs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const jobs = useEmailJobs({ page, limit: 20 });
  const detection = useBackendCapabilities().detection;
  const { can } = useSession();
  // The news mailing list (owner 2026-11-23) lives next to bulk e-mail: the Administrators' side menu is full.
  const subscribers = subscribersSupported(detection) && can(SUBSCRIBERS_PERMISSION);
  // The Resend Free plan budget (owner 2026-11-24): how much may still be sent, and what waits.
  const budget = emailBudgetSupported(detection);

  return (
    <AdminPage
      title="E-mail"
      description="Bulk e-mails sent to users of the platform, with delivery progress per recipient."
      actions={
        <>
          {subscribers && (
            <Link href="/admin/subscribers" className={btnSecondary} data-testid="subscribers-link">
              <Newspaper className="h-3.5 w-3.5" aria-hidden="true" /> Subscribers
            </Link>
          )}
          <Link href="/admin/email/new" className={btnPrimary}>
            <MailPlus className="h-3.5 w-3.5" aria-hidden="true" /> New e-mail
          </Link>
        </>
      }
    >
      {budget && <SendingTodayPanel />}
      <Notice tone="info">
        Failed deliveries of a bulk e-mail are listed in its job and can be retried there. Failed account e-mails (invitations, password resets, notices) are on the{" "}
        <Link href="/admin/email/failed" className={linkBtn}>
          Failed e-mails
        </Link>{" "}
        page.
      </Notice>
      {jobs.isError ? (
        <ErrorState error={jobs.error} title="Couldn't load the e-mail jobs" onRetry={() => jobs.refetch()} />
      ) : (
        <TableCard
          footer={
            jobs.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={jobs.data.meta.totalPages} total={jobs.data.meta.total} onPage={(p) => router.replace(`${pathname}?page=${p}`, { scroll: false })} disabled={jobs.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Subject</th>
              <th className={th}>Status</th>
              <th className={th}>Recipients</th>
              <th className={th}>Sent</th>
              <th className={th}>Failed</th>
              <th className={th}>Created</th>
              <th className={th}>By</th>
              <th className={th}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="email-jobs">
            {jobs.isPending ? (
              <TableMessage colSpan={8}>Loading e-mail jobs…</TableMessage>
            ) : jobs.data.data.length === 0 ? (
              <TableMessage colSpan={8}>No e-mail has been sent yet.</TableMessage>
            ) : (
              jobs.data.data.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50/60 text-xs" data-testid="email-job-row">
                  <td className={`${td} font-semibold text-gray-800 max-w-[280px] break-words`}>{j.subject}</td>
                  <td className={td}>
                    <JobStatusBadge status={j.status} />
                  </td>
                  <td className={td}>{formatNumber(j.totalRecipients)}</td>
                  <td className={td}>{formatNumber(j.sentCount)}</td>
                  <td className={`${td} ${j.failedCount > 0 ? "text-red-600 font-semibold" : ""}`}>{formatNumber(j.failedCount)}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{formatDateTime(j.createdAt)}</td>
                  <td className={`${td} text-gray-600`}>{j.createdBy ? `@${j.createdBy.username}` : "—"}</td>
                  <td className={td}>
                    <Link href={`/admin/email/jobs/${j.id}`} className={linkBtn} aria-label={`Open ${j.subject}`}>
                      Open
                    </Link>
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
