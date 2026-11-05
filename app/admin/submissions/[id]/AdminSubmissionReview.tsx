"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, History, Undo2 } from "lucide-react";
import { REVIEW_ADMIN_RULES } from "@/lib/api/admin";
import { reviewsApi } from "@/lib/api/mentor";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { AdminSubmission } from "@/lib/api/types";
import { useAdminReviewCycles, useAdminSubmission, useReviewDecision, type ReviewDecision } from "@/lib/queries/admin";
import { formatDateTime, personName } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import { AdminPage, Badge, Card, ConfirmDialog, Notice, SubmissionBadge, btnPrimary, btnSecondary, type NoteRule } from "../../components/adminUi";
import { humanizeAction } from "../../components/auditText";
import ResultActions from "./ResultActions";

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

interface Decision {
  type: ReviewDecision["type"];
  title: string;
  body: string;
  label: string;
  tone?: "danger";
  note: NoteRule;
  done: string;
}

const APPROVE: Decision = {
  type: "approve",
  title: "Approve this review?",
  body: "The score and feedback are accepted as they are. The result reaches the student only when you publish it.",
  label: "Approve review",
  note: { label: "Coordination note (internal, never shown to the student)", required: false, min: REVIEW_ADMIN_RULES.coordinationNote.min, max: REVIEW_ADMIN_RULES.coordinationNote.max },
  done: "Review approved. Publish the result when you are ready.",
};

const SEND_BACK: Decision = {
  type: "sendBack",
  title: "Send this review back to the mentor?",
  body: "The mentor sees your reason, can change the score or feedback and send it again. The student sees nothing yet.",
  label: "Send back to mentor",
  tone: "danger",
  note: { label: "Reason for the mentor", required: true, min: REVIEW_ADMIN_RULES.rejectionReason.min, max: REVIEW_ADMIN_RULES.rejectionReason.max, placeholder: "What should the mentor check or change?" },
  done: "Review sent back to the mentor.",
};

/**
 * One submission as the administrator sees it: the student's work, the
 * mentor's review (read-only — administrators never grade) and the decision.
 */
export default function AdminSubmissionReview({ submissionId }: { submissionId: string }) {
  const sub = useAdminSubmission(submissionId);
  const cycles = useAdminReviewCycles(submissionId);
  const decide = useReviewDecision(submissionId);
  const [confirm, setConfirm] = useState<Decision | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const backTo = sub.data ? `/admin/assignments/${sub.data.assignment.id}` : "/admin/results";
  const back = (
    <Link href={backTo} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {sub.data ? sub.data.assignment.title : "Results"}
    </Link>
  );
  if (sub.isPending) return <AdminPage title="Submission">{back}<LoadingBlock /></AdminPage>;
  if (sub.isError)
    return (
      <AdminPage title="Submission">
        {back}
        <ErrorState error={sub.error} title={isApiError(sub.error) && [400, 404].includes(sub.error.status) ? "Submission not found" : "Couldn't load this submission"} onRetry={() => sub.refetch()} />
      </AdminPage>
    );

  const s: AdminSubmission = sub.data;
  const r = s.review;
  const max = s.assignment.maximumMarks;
  const canApprove = s.status === "SUBMITTED_TO_ADMIN";
  const canSendBack = s.status === "SUBMITTED_TO_ADMIN" || s.status === "APPROVED";

  return (
    <AdminPage
      title={personName(s.student)}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {s.assignment.title} · {s.assignment.course.title} · {s.assignment.division.name} <SubmissionBadge status={s.status} />
        </span>
      }
    >
      {back}
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Mentor review (read-only) */}
          <Card className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Mentor review</h2>
            <p className="text-xs text-gray-500 mb-4">Administrators approve or send back reviews; only the mentor can change the score or feedback.</p>
            {!r ? (
              <p className="text-sm text-gray-500">Not assigned to a mentor yet.</p>
            ) : (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Info label="Mentor">{personName(r.mentor, "—")}</Info>
                  <Info label="Score">{r.score != null ? `${r.score} / ${max}` : "Not marked"}</Info>
                  <Info label="Percentage">{r.percentage != null ? `${r.percentage}%` : "—"}</Info>
                  <Info label="Review cycle">{r.cycle}</Info>
                  {r.markedAt && <Info label="Marked">{formatDateTime(r.markedAt)}</Info>}
                  {r.returnedAt && <Info label="Sent to admin">{formatDateTime(r.returnedAt)}</Info>}
                  {r.decidedAt && <Info label="Decided">{formatDateTime(r.decidedAt)}</Info>}
                </dl>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Feedback</h3>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-xl p-4">{r.feedback || "—"}</div>
                </div>
                {r.attachments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {r.attachments.map((att) => (
                      <FileButton key={att.id} file={att.file} fetchFile={() => reviewsApi.feedbackFile(s.id, att.id, att.file.originalName)} />
                    ))}
                  </div>
                )}
                {r.decisionNote && <Alert tone="info">Sent back earlier: “{r.decisionNote}”</Alert>}
                {r.coordinationNote && <p className="text-xs text-gray-500">Coordination note (internal): {r.coordinationNote}</p>}
              </div>
            )}
          </Card>

          {/* Student's work */}
          <Card className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Student&apos;s work</h2>
            <ol className="space-y-5">
              {s.revisions
                .slice()
                .sort((a, b) => b.revisionNumber - a.revisionNumber)
                .map((rev) => (
                  <li key={rev.id} className="border border-gray-100 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Attempt {rev.revisionNumber} · {formatDateTime(rev.submittedAt)} {rev.isLate && <Badge className="ml-1 bg-red-50 text-red-600">Late</Badge>}
                    </p>
                    {rev.note && <p className="text-xs text-gray-500 mb-2">Student&apos;s note: {rev.note}</p>}
                    {rev.answerText && <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-3 mb-2">{rev.answerText}</div>}
                    {rev.attachments.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {rev.attachments.map((att) => (
                          <FileButton key={att.id} file={att.file} fetchFile={() => reviewsApi.submissionFile(s.id, att.id, att.file.originalName)} />
                        ))}
                      </div>
                    )}
                    {!rev.answerText && rev.attachments.length === 0 && <p className="text-xs text-gray-400">No text or files.</p>}
                  </li>
                ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Decision</h2>
            {canApprove || canSendBack ? (
              <div className="flex flex-col gap-2">
                {canApprove && (
                  <button type="button" onClick={() => setConfirm(APPROVE)} className={btnPrimary}>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Approve review
                  </button>
                )}
                {canSendBack && (
                  <button type="button" onClick={() => setConfirm(SEND_BACK)} className={btnSecondary}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> Send back to mentor
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                {s.status === "PUBLISHED"
                  ? "The result is published to the student."
                  : s.status === "SUBMITTED"
                    ? "Waiting to be distributed to a mentor."
                    : "Waiting for the mentor. You can decide once the review is sent to you."}
              </p>
            )}
            <ResultActions submission={s} onDone={setNotice} />
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-gray-500" aria-hidden="true" /> Review cycles
            </h2>
            {cycles.isPending ? (
              <Spinner />
            ) : cycles.isError ? (
              <p className="text-sm text-red-600">{errorMessage(cycles.error)}</p>
            ) : cycles.data.length === 0 ? (
              <p className="text-sm text-gray-500">No review yet.</p>
            ) : (
              <ol className="space-y-4">
                {cycles.data.map((c) => (
                  <li key={c.id} className="text-xs">
                    <p className="font-semibold text-gray-800">
                      Cycle {c.cycle} · {personName(c.mentor, "—")} · <span className="font-normal text-gray-500">{humanizeAction(c.status)}</span>
                      {c.score != null && <span className="font-normal text-gray-500"> · {c.score} / {max}</span>}
                    </p>
                    <ul className="mt-1 space-y-1 border-l border-gray-200 pl-3">
                      {c.events.map((e) => (
                        <li key={e.id} className="text-gray-500">
                          {humanizeAction(e.type)} · {formatDateTime(e.createdAt)}
                          {e.actor && ` · ${personName(e.actor)}`}
                          {e.note && <span className="block text-gray-600 break-words">{e.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          tone={confirm.tone}
          note={confirm.note}
          onClose={() => setConfirm(null)}
          onConfirm={async (note) => {
            await decide.mutateAsync(confirm.type === "approve" ? { type: "approve", note: note || undefined } : { type: "sendBack", reason: note });
            setNotice(confirm.done);
          }}
        />
      )}
    </AdminPage>
  );
}
