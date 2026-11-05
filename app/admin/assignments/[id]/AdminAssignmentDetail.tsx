"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, CheckCircle2, History, Lock, RotateCcw, Undo2, Unlock } from "lucide-react";
import { ASSIGNMENT_ADMIN_RULES } from "@/lib/api/admin";
import { mentorAssignmentsApi } from "@/lib/api/mentor";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { MentorAssignment } from "@/lib/api/types";
import { useAdminAssignment, useAdminAssignmentHistory, useAssignmentAdminAction, useAssignmentReport, type AssignmentAdminAction } from "@/lib/queries/admin";
import { useNow } from "@/lib/hooks/useNow";
import { formatDateTime, formatNumber, personName } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import { ADMIN_ASSIGNMENT_STATUS, AdminPage, AssignmentBadge, Card, ConfirmDialog, Modal, Notice, btnPrimary, btnSecondary, type NoteRule } from "../../components/adminUi";
import { humanizeAction } from "../../components/auditText";

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="text-sm text-gray-800 mt-0.5">{children}</dd>
    </div>
  );
}

interface Confirm {
  action: AssignmentAdminAction["type"];
  title: string;
  body: ReactNode;
  label: string;
  tone?: "danger";
  note?: NoteRule;
  done: string;
}

/** Actions the backend allows from each state (assignments.service.ts). */
function actionsFor(a: MentorAssignment, now: number): Confirm[] {
  const out: Confirm[] = [];
  const deadlinePassed = new Date(a.deadline).getTime() <= now;
  if (a.status === "PENDING_APPROVAL") {
    if (!deadlinePassed)
      out.push({ action: "publish", title: "Publish this assignment?", body: `Students of the ${a.division.name} see it and can submit until ${formatDateTime(a.deadline)}. They are notified.`, label: "Approve & publish", done: "Assignment published. Students have been notified." });
    out.push({
      action: "reject",
      title: "Return this assignment to the mentor?",
      body: "The mentor sees your note, can change the assignment and submit it again.",
      label: "Return to mentor",
      tone: "danger",
      note: { label: "Note for the mentor", required: true, min: ASSIGNMENT_ADMIN_RULES.rejectionNote.min, max: ASSIGNMENT_ADMIN_RULES.rejectionNote.max, placeholder: "What should be changed?" },
      done: "Assignment returned to the mentor.",
    });
  }
  if (a.status === "PUBLISHED") {
    out.push({
      action: "close",
      title: "Close submissions?",
      body: "Students can no longer submit. Submitted work stays and can still be reviewed. You can reopen it later.",
      label: "Close submissions",
      note: { label: "Note", required: false, min: ASSIGNMENT_ADMIN_RULES.note.min, max: ASSIGNMENT_ADMIN_RULES.note.max },
      done: "Submissions closed.",
    });
    if ((a._count?.submissions ?? 0) === 0)
      out.push({ action: "unpublish", title: "Unpublish this assignment?", body: "It goes back to draft and students no longer see it. Possible only while nobody has submitted.", label: "Unpublish", tone: "danger", done: "Assignment unpublished (back to draft)." });
  }
  if (a.status !== "ARCHIVED")
    out.push({ action: "archive", title: "Archive this assignment?", body: "It becomes read-only and leaves the active lists. Submissions and results are kept.", label: "Archive", tone: "danger", done: "Assignment archived." });
  return out;
}

const ICON: Record<string, ReactNode> = {
  publish: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  reject: <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />,
  close: <Lock className="h-3.5 w-3.5" aria-hidden="true" />,
  unpublish: <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />,
  archive: <Archive className="h-3.5 w-3.5" aria-hidden="true" />,
};

/** CLOSED → PUBLISHED with an optional new deadline (required when the old one passed and late work is not accepted). */
function ReopenDialog({ a, onClose, onDone }: { a: MentorAssignment; onClose: () => void; onDone: () => void }) {
  const act = useAssignmentAdminAction(a.id);
  const now = useNow();
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsDeadline = new Date(a.deadline).getTime() <= now && !a.allowLateSubmission;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (needsDeadline && !deadline) return setError("The deadline has passed: choose a new one.");
    if (deadline && new Date(deadline).getTime() <= Date.now()) return setError("The new deadline must be in the future.");
    if (note.trim().length > ASSIGNMENT_ADMIN_RULES.note.max) return setError("The note can be at most 1,000 characters.");
    setError(null);
    try {
      await act.mutateAsync({ type: "reopen", note: note.trim() || undefined, deadline: deadline ? new Date(deadline).toISOString() : undefined });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Reopen submissions?" onClose={act.isPending ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">Students can submit again. Current deadline: {formatDateTime(a.deadline)}.</p>
        <div>
          <label htmlFor="reopen-deadline" className="block text-xs font-semibold text-gray-600 mb-1">
            New deadline {needsDeadline ? <span className="text-red-500">*</span> : <span className="font-normal text-gray-400">(optional)</span>}
          </label>
          <input id="reopen-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="reopen-note" className="block text-xs font-semibold text-gray-600 mb-1">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea id="reopen-note" rows={3} value={note} maxLength={ASSIGNMENT_ADMIN_RULES.note.max} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 text-sm" />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-gray-600">
            Cancel
          </button>
          <button type="submit" disabled={act.isPending} className={btnPrimary}>
            {act.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Reopen
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminAssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const now = useNow();
  const assignment = useAdminAssignment(assignmentId);
  const history = useAdminAssignmentHistory(assignmentId);
  const act = useAssignmentAdminAction(assignmentId);
  const report = useAssignmentReport(assignment.data ? { courseId: assignment.data.courseId, divisionId: assignment.data.divisionId, status: assignment.data.status } : {});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reopen, setReopen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const back = (
    <Link href="/admin/assignments" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All assignments
    </Link>
  );
  if (assignment.isPending) return <AdminPage title="Assignment">{back}<LoadingBlock /></AdminPage>;
  if (assignment.isError)
    return (
      <AdminPage title="Assignment">
        {back}
        <ErrorState error={assignment.error} title={isApiError(assignment.error) && [400, 404].includes(assignment.error.status) ? "Assignment not found" : "Couldn't load this assignment"} onRetry={() => assignment.refetch()} />
      </AdminPage>
    );

  const a = assignment.data;
  const actions = actionsFor(a, now);
  const row = report.data?.data.find((r) => r.id === a.id);
  const deadlinePassed = new Date(a.deadline).getTime() <= now;

  return (
    <AdminPage
      title={a.title}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          {a.course.title} · {a.division.name} · prepared by {personName(a.createdBy, "a mentor")} <AssignmentBadge status={a.status} />
        </span>
      }
    >
      {back}
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      {a.status === "PENDING_APPROVAL" && deadlinePassed && (
        <div className="mb-4">
          <Alert tone="info">The deadline has passed, so this assignment cannot be published. Return it to the mentor to set a new deadline.</Alert>
        </div>
      )}
      {a.status === "REJECTED" && a.rejectionNote && (
        <div className="mb-4">
          <Alert tone="info">Returned to the mentor: “{a.rejectionNote}”</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6 lg:col-span-2 space-y-5">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Info label="Deadline">{formatDateTime(a.deadline)}</Info>
            <Info label="Maximum marks">{formatNumber(a.maximumMarks)}</Info>
            <Info label="Points">{formatNumber(a.points)}</Info>
            <Info label="Resubmission">{a.allowResubmission ? `Allowed (up to ${a.maxResubmissions})` : "Not allowed"}</Info>
            <Info label="Late work">{a.allowLateSubmission ? "Accepted" : "Not accepted"}</Info>
            <Info label="Academic year">{a.academicYear.name}</Info>
            {a.submittedAt && <Info label="Sent for approval">{formatDateTime(a.submittedAt)}</Info>}
            {a.publishedAt && <Info label="Published">{formatDateTime(a.publishedAt)}</Info>}
            {a.closedAt && <Info label="Closed">{formatDateTime(a.closedAt)}</Info>}
          </dl>
          {a.description && <p className="text-sm text-gray-600">{a.description}</p>}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Instructions</h2>
            <div className="text-sm text-gray-800 whitespace-pre-wrap break-words bg-gray-50 border border-gray-100 rounded-xl p-4">{a.instructions}</div>
          </div>
          {a.attachments.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Brief files</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {a.attachments.map((att) => (
                  <FileButton key={att.id} file={att.file} fetchFile={() => mentorAssignmentsApi.briefFile(a.id, att.id, att.file.originalName)} />
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Actions</h2>
            <p className="text-xs text-gray-500 mb-4">Administrators approve, publish and close assignments. Only the mentor can change their content.</p>
            <div className="flex flex-col gap-2">
              {actions.map((c) => (
                <button key={c.action} type="button" onClick={() => setConfirm(c)} className={c.action === "publish" ? btnPrimary : btnSecondary}>
                  {ICON[c.action]} {c.label}
                </button>
              ))}
              {a.status === "CLOSED" && (
                <button type="button" onClick={() => setReopen(true)} className={btnPrimary}>
                  <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> Reopen submissions
                </button>
              )}
              {actions.length === 0 && a.status !== "CLOSED" && <p className="text-xs text-gray-400">No actions are available in this state.</p>}
            </div>
          </Card>
          {row && (
            <Card className="p-6">
              <h2 className="text-base font-bold text-gray-900 mb-3">Submissions</h2>
              <dl className="grid grid-cols-2 gap-3">
                <Info label="Submitted">{`${row.submitted} / ${row.expectedStudents}`}</Info>
                <Info label="Late">{row.late}</Info>
                <Info label="To distribute">{row.byStage.awaitingDistribution}</Info>
                <Info label="With mentors">{row.byStage.inReview}</Info>
                <Info label="Awaiting approval">{row.byStage.awaitingApproval}</Info>
                <Info label="Published">{row.byStage.published}</Info>
              </dl>
            </Card>
          )}
        </div>
      </div>

      <Card className="p-6 mt-6">
        <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" aria-hidden="true" /> History
        </h2>
        {history.isPending ? (
          <Spinner />
        ) : history.isError ? (
          <p className="text-sm text-red-600">{errorMessage(history.error)}</p>
        ) : history.data.length === 0 ? (
          <p className="text-sm text-gray-500">No history yet.</p>
        ) : (
          <ol className="space-y-3">
            {history.data
              .slice()
              .reverse()
              .map((ev) => (
                <li key={ev.id} className="flex gap-3 text-sm">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">
                      {humanizeAction(ev.type)}
                      {ev.toStatus && ev.fromStatus && ev.toStatus !== ev.fromStatus && (
                        <span className="font-normal text-gray-500">
                          {" "}
                          · {ADMIN_ASSIGNMENT_STATUS[ev.fromStatus]?.label ?? ev.fromStatus} → {ADMIN_ASSIGNMENT_STATUS[ev.toStatus]?.label ?? ev.toStatus}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDateTime(ev.createdAt)} · {personName(ev.actor, "System")}
                    </p>
                    {ev.note && <p className="text-xs text-gray-600 mt-0.5 break-words">{ev.note}</p>}
                  </div>
                </li>
              ))}
          </ol>
        )}
      </Card>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          tone={confirm.tone}
          note={confirm.note}
          onClose={() => setConfirm(null)}
          onConfirm={async (note) => {
            const type = confirm.action;
            const action: AssignmentAdminAction =
              type === "reject" ? { type, note } : type === "close" ? { type, note: note || undefined } : ({ type } as AssignmentAdminAction);
            await act.mutateAsync(action);
            setNotice(confirm.done);
          }}
        />
      )}
      {reopen && <ReopenDialog a={a} onClose={() => setReopen(false)} onDone={() => setNotice("Submissions reopened.")} />}
    </AdminPage>
  );
}

