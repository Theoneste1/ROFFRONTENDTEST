"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { HiddenComment, ReportReason, ReportStatus } from "@/lib/api/types";
import { useHiddenComments, useModerate, useModerationActions, useModerationReports } from "@/lib/queries/admin";
import { formatDateTime, personName } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, ConfirmDialog, FilterPills, Notice, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";
import { humanizeAction } from "../components/auditText";
import { REASON_LABEL, REPORT_STATUS, excerpt } from "./moderationUi";

type Tab = "reports" | "hidden" | "actions";

function ReportsTab() {
  const [status, setStatus] = useState<"" | ReportStatus>("OPEN");
  const [reason, setReason] = useState<"" | ReportReason>("");
  const [targetType, setTargetType] = useState<"" | "THREAD" | "COMMENT">("");
  const [page, setPage] = useState(1);
  const reports = useModerationReports({ status: status || undefined, reason: reason || undefined, targetType: targetType || undefined, page, limit: 20 });
  const reset = () => setPage(1);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FilterPills
          label="Report status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            reset();
          }}
          options={[
            { label: "Open", value: "OPEN" },
            { label: "Resolved", value: "RESOLVED" },
            { label: "Dismissed", value: "DISMISSED" },
            { label: "All", value: "" },
          ]}
        />
        <SelectFilter
          label="Reason"
          value={reason}
          onChange={(v) => {
            setReason(v as "" | ReportReason);
            reset();
          }}
          options={[{ label: "Any", value: "" }, ...Object.entries(REASON_LABEL).map(([value, label]) => ({ value, label }))]}
        />
        <SelectFilter
          label="Target"
          value={targetType}
          onChange={(v) => {
            setTargetType(v as "" | "THREAD" | "COMMENT");
            reset();
          }}
          options={[
            { label: "Any", value: "" },
            { label: "Comments", value: "COMMENT" },
            { label: "Threads", value: "THREAD" },
          ]}
        />
      </div>
      {reports.isError ? (
        <ErrorState error={reports.error} title="Couldn't load reports" onRetry={() => reports.refetch()} />
      ) : (
        <TableCard
          footer={
            reports.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={reports.data.meta.totalPages} total={reports.data.meta.total} onPage={setPage} disabled={reports.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Reported content</th>
              <th className={th}>Reason</th>
              <th className={th}>Reported by</th>
              <th className={th}>When</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${reports.isFetching && reports.data ? "opacity-60" : ""}`}>
            {reports.isPending ? (
              <TableMessage colSpan={6}>Loading reports…</TableMessage>
            ) : reports.data.data.length === 0 ? (
              <TableMessage colSpan={6}>{status === "OPEN" ? "No open reports. Nothing needs moderation." : "No reports."}</TableMessage>
            ) : (
              reports.data.data.map((r) => (
                <tr key={r.id} className="text-xs hover:bg-gray-50/60">
                  <td className={`${td} text-gray-700 max-w-[320px]`}>
                    <span className="block font-semibold text-gray-800">{r.targetType === "COMMENT" ? "Comment" : "Thread"} in “{excerpt(r.thread?.title, 60)}”</span>
                    <span className="block text-gray-500 break-words">{excerpt(r.contentSnapshot)}</span>
                  </td>
                  <td className={td}>
                    <Badge className="bg-rose-50 text-rose-600">{REASON_LABEL[r.reason] ?? r.reason}</Badge>
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{personName(r.reporter, "—")}</td>
                  <td className={`${td} text-gray-500 whitespace-nowrap`}>{formatDateTime(r.createdAt)}</td>
                  <td className={td}>
                    <Badge className={REPORT_STATUS[r.status].badge}>{REPORT_STATUS[r.status].label}</Badge>
                  </td>
                  <td className={td}>
                    <Link href={`/admin/moderation/reports/${r.id}`} className={linkBtn}>
                      {r.status === "OPEN" ? "Review" : "View"}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </>
  );
}

function HiddenTab() {
  const [page, setPage] = useState(1);
  const hidden = useHiddenComments(page);
  const moderate = useModerate();
  const [restore, setRestore] = useState<HiddenComment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      {hidden.isError ? (
        <ErrorState error={hidden.error} onRetry={() => hidden.refetch()} />
      ) : (
        <TableCard
          footer={
            hidden.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={hidden.data.meta.totalPages} total={hidden.data.meta.total} onPage={setPage} disabled={hidden.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Comment</th>
              <th className={th}>Author</th>
              <th className={th}>Thread</th>
              <th className={th}>Posted</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {hidden.isPending ? (
              <TableMessage colSpan={5}>Loading hidden comments…</TableMessage>
            ) : hidden.data.data.length === 0 ? (
              <TableMessage colSpan={5}>No hidden comments.</TableMessage>
            ) : (
              hidden.data.data.map((c) => (
                <tr key={c.id} className="text-xs hover:bg-gray-50/60">
                  <td className={`${td} text-gray-700 max-w-[320px] break-words`}>{excerpt(c.content)}</td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{personName(c.author, "—")}</td>
                  <td className={`${td} text-gray-600`}>{excerpt(c.thread.title, 50)}</td>
                  <td className={`${td} text-gray-500 whitespace-nowrap`}>{formatDateTime(c.createdAt)}</td>
                  <td className={td}>
                    <button type="button" onClick={() => setRestore(c)} className={linkBtn}>
                      Restore
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
      {restore && (
        <ConfirmDialog
          title="Restore this comment?"
          body="It becomes visible again in the discussion."
          confirmLabel="Restore"
          note={{ label: "Reason", required: false, min: 1, max: 1000 }}
          onClose={() => setRestore(null)}
          onConfirm={async (reason) => {
            await moderate.mutateAsync({ type: "comment", commentId: restore.id, op: "restore", reason: reason || undefined });
            setNotice("Comment restored.");
          }}
        />
      )}
    </>
  );
}

function ActionsTab() {
  const [page, setPage] = useState(1);
  const actions = useModerationActions(page);
  if (actions.isError) return <ErrorState error={actions.error} onRetry={() => actions.refetch()} />;
  return (
    <TableCard
      footer={
        actions.data && (
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={actions.data.meta.totalPages} total={actions.data.meta.total} onPage={setPage} disabled={actions.isFetching} />
          </div>
        )
      }
    >
      <thead>
        <tr className="border-b border-gray-100">
          <th className={th}>When</th>
          <th className={th}>Moderator</th>
          <th className={th}>Action</th>
          <th className={th}>Content</th>
          <th className={th}>Reason</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100/80">
        {actions.isPending ? (
          <TableMessage colSpan={5}>Loading…</TableMessage>
        ) : actions.data.data.length === 0 ? (
          <TableMessage colSpan={5}>No moderation actions yet.</TableMessage>
        ) : (
          actions.data.data.map((a) => (
            <tr key={a.id} className="text-xs">
              <td className={`${td} text-gray-400 whitespace-nowrap`}>{formatDateTime(a.createdAt)}</td>
              <td className={`${td} text-gray-700 font-semibold whitespace-nowrap`}>{personName(a.moderator, "—")}</td>
              <td className={`${td} text-gray-700`}>{humanizeAction(a.action)}</td>
              <td className={`${td} text-gray-500 max-w-[280px] break-words`}>{a.comment ? excerpt(a.comment.content, 80) : a.thread ? `Thread “${excerpt(a.thread.title, 60)}”` : "—"}</td>
              <td className={`${td} text-gray-500`}>{a.reason || "—"}</td>
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
  );
}

/** Discussion moderation: reports, hidden comments and the moderation log. */
export default function ModerationClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "hidden" || tabParam === "actions" ? tabParam : "reports";
  const openCount = useModerationReports({ status: "OPEN", limit: 1 }).data?.meta.total;
  const TABS: { id: Tab; label: string }[] = [
    { id: "reports", label: "Reports" },
    { id: "hidden", label: "Hidden comments" },
    { id: "actions", label: "Moderation log" },
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Moderation</h1>
        <p className="text-sm text-gray-500 mt-1 font-medium">Reported discussion content, hidden comments and every moderation action.</p>
      </div>
      <div className="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => router.replace(t.id === "reports" ? pathname : `${pathname}?tab=${t.id}`, { scroll: false })}
            className={`pb-3 text-sm font-semibold -mb-px border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
            {t.id === "reports" && !!openCount && <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[11px]">{openCount}</span>}
          </button>
        ))}
      </div>
      {tab === "reports" ? <ReportsTab /> : tab === "hidden" ? <HiddenTab /> : <ActionsTab />}
    </>
  );
}
