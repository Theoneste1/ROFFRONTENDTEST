"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MODERATION_RULES, type ResolveAction, type ThreadOp } from "@/lib/api/admin";
import { isApiError } from "@/lib/api/errors";
import { useModerate, useModerationReport, type ModerationMutation } from "@/lib/queries/admin";
import { formatDateTime, personName } from "@/lib/format";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { AdminPage, Badge, Card, ConfirmDialog, Notice, btnDanger, btnPrimary, btnSecondary } from "../../../components/adminUi";
import { REASON_LABEL, REPORT_STATUS } from "../../moderationUi";

interface Pending {
  mutation: (note: string) => ModerationMutation;
  title: string;
  body: string;
  label: string;
  danger?: boolean;
  done: string;
}

const RESOLVE: Record<ResolveAction, { label: string; body: string; danger?: boolean; done: string }> = {
  HIDE: { label: "Hide content", body: "The reported content is hidden from students and coaches. It can be restored later.", danger: true, done: "Content hidden; report resolved." },
  DELETE: { label: "Delete content", body: "The reported content is removed. It is kept only for the moderation record.", danger: true, done: "Content deleted; report resolved." },
  LOCK: { label: "Lock thread", body: "Nobody can post in the thread any more. Existing posts stay visible.", done: "Thread locked; report resolved." },
  NONE: { label: "Dismiss report", body: "Nothing is changed; the report is closed as not needing action.", done: "Report dismissed." },
};

/** Thread operations the backend allows from each thread state. */
const THREAD_OPS: { op: ThreadOp; label: string; from: string[] }[] = [
  { op: "lock", label: "Lock thread", from: ["OPEN"] },
  { op: "unlock", label: "Unlock thread", from: ["LOCKED"] },
  { op: "hide", label: "Hide thread", from: ["OPEN", "LOCKED"] },
  { op: "restore", label: "Restore thread", from: ["HIDDEN"] },
  { op: "archive", label: "Archive thread", from: ["OPEN", "LOCKED"] },
];

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export default function ReportDetail({ reportId }: { reportId: string }) {
  const report = useModerationReport(reportId);
  const moderate = useModerate();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const back = (
    <Link href="/admin/moderation" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Moderation
    </Link>
  );
  if (report.isPending) return <AdminPage title="Reported content">{back}<LoadingBlock /></AdminPage>;
  if (report.isError)
    return (
      <AdminPage title="Reported content">
        {back}
        <ErrorState error={report.error} title={isApiError(report.error) && [400, 404].includes(report.error.status) ? "Report not found" : "Couldn't load this report"} onRetry={() => report.refetch()} />
      </AdminPage>
    );

  const r = report.data;
  const contentStatus = r.comment?.status ?? r.thread?.status;
  const removed = contentStatus === "DELETED";
  const open = r.status === "OPEN";
  const resolveActions: ResolveAction[] = removed ? ["NONE"] : r.thread ? ["HIDE", "DELETE", "LOCK", "NONE"] : ["HIDE", "DELETE", "NONE"];

  const askResolve = (a: ResolveAction) =>
    setPending({
      mutation: (note) => ({ type: "resolve", reportId: r.id, action: a, note: note || undefined }),
      title: `${RESOLVE[a].label}?`,
      body: RESOLVE[a].body,
      label: RESOLVE[a].label,
      danger: RESOLVE[a].danger,
      done: RESOLVE[a].done,
    });

  return (
    <AdminPage
      title={`${r.targetType === "COMMENT" ? "Reported comment" : "Reported thread"}`}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {REASON_LABEL[r.reason] ?? r.reason} · reported {formatDateTime(r.createdAt)} by {personName(r.reporter, "—")} <Badge className={REPORT_STATUS[r.status].badge}>{REPORT_STATUS[r.status].label}</Badge>
        </span>
      }
    >
      {back}
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Reported text (as it was when reported)</h2>
              <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-xl p-4">{r.contentSnapshot}</div>
            </div>
            {r.comment && r.comment.content !== r.contentSnapshot && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Current text {r.comment.editedAt && `(edited ${formatDateTime(r.comment.editedAt)})`}</h2>
                <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-xl p-4">{r.comment.content}</div>
              </div>
            )}
            {r.details && <Info label="Reporter's details">{r.details}</Info>}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Info label="Author">{personName(r.comment?.author ?? r.thread?.createdBy, "—")}</Info>
              <Info label="Thread">
                {r.thread ? (
                  <>
                    “{r.thread.title}” ({r.thread.status.toLowerCase()})
                    {r.thread.status !== "DELETED" && (
                      <Link href={`/admin/discussions/${r.thread.id}`} className="block mt-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                        View discussion
                      </Link>
                    )}
                  </>
                ) : (
                  "—"
                )}
              </Info>
              <Info label="Content status">{contentStatus ? contentStatus.toLowerCase() : "—"}</Info>
            </dl>
            {!open && (
              <p className="text-xs text-gray-500">
                {REPORT_STATUS[r.status].label} {formatDateTime(r.resolvedAt)} by {personName(r.resolvedBy, "—")}
                {r.resolutionNote && ` — ${r.resolutionNote}`}
              </p>
            )}
          </Card>

          {r.otherReports.length > 0 && (
            <Card className="p-6">
              <h2 className="text-base font-bold text-gray-900 mb-3">Other reports of the same content</h2>
              <ul className="space-y-2 text-xs text-gray-600">
                {r.otherReports.map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/moderation/reports/${o.id}`} className="text-indigo-600 hover:text-indigo-800 font-medium">
                      {REASON_LABEL[o.reason] ?? o.reason}
                    </Link>{" "}
                    · {personName(o.reporter, "—")} · {formatDateTime(o.createdAt)} · {REPORT_STATUS[o.status].label}
                    {o.details && <span className="block text-gray-500">{o.details}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Resolve report</h2>
            {open ? (
              <>
                <p className="text-xs text-gray-500 mb-4">{removed ? "The content has already been removed; the report can only be dismissed." : "Choose what to do with the reported content."}</p>
                <div className="flex flex-col gap-2">
                  {resolveActions.map((a) => (
                    <button key={a} type="button" onClick={() => askResolve(a)} className={a === "NONE" ? btnSecondary : RESOLVE[a].danger ? btnDanger : btnPrimary}>
                      {RESOLVE[a].label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">This report has been handled.</p>
            )}
          </Card>

          {r.thread && (
            <Card className="p-6">
              <h2 className="text-base font-bold text-gray-900 mb-1">Thread</h2>
              <p className="text-xs text-gray-500 mb-4">Status: {r.thread.status.toLowerCase()}</p>
              <div className="flex flex-col gap-2">
                {THREAD_OPS.filter((o) => o.from.includes(r.thread!.status)).map((o) => (
                  <button
                    key={o.op}
                    type="button"
                    className={btnSecondary}
                    onClick={() =>
                      setPending({
                        mutation: (note) => ({ type: "thread", threadId: r.thread!.id, op: o.op, reason: note || undefined }),
                        title: `${o.label}?`,
                        body: `“${r.thread!.title}”`,
                        label: o.label,
                        done: `${o.label}: done.`,
                      })
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {r.comment && (r.comment.status === "ACTIVE" || r.comment.status === "HIDDEN") && !open && (
                <button
                  type="button"
                  className={`${btnSecondary} w-full mt-2`}
                  onClick={() =>
                    setPending({
                      mutation: (note) => ({ type: "comment", commentId: r.comment!.id, op: r.comment!.status === "HIDDEN" ? "restore" : "hide", reason: note || undefined }),
                      title: r.comment!.status === "HIDDEN" ? "Restore the comment?" : "Hide the comment?",
                      body: "The change is recorded in the moderation log.",
                      label: r.comment!.status === "HIDDEN" ? "Restore comment" : "Hide comment",
                      done: r.comment!.status === "HIDDEN" ? "Comment restored." : "Comment hidden.",
                    })
                  }
                >
                  {r.comment.status === "HIDDEN" ? "Restore comment" : "Hide comment"}
                </button>
              )}
            </Card>
          )}
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title={pending.title}
          body={pending.body}
          confirmLabel={pending.label}
          tone={pending.danger ? "danger" : "primary"}
          note={{ label: "Note", required: false, min: MODERATION_RULES.note.min, max: MODERATION_RULES.note.max }}
          onClose={() => setPending(null)}
          onConfirm={async (note) => {
            await moderate.mutateAsync(pending.mutation(note));
            setNotice(pending.done);
          }}
        />
      )}
    </AdminPage>
  );
}
