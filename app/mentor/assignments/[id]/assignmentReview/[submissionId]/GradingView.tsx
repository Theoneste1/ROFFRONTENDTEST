"use client";

/**
 * Review one submission. Follows the backend review pipeline:
 *   ASSIGNED ─start→ IN_PROGRESS ─mark→ MARKED ─submit→ RETURNED (with the admin)
 *   admin approves → APPROVED → PUBLISHED, or sends back → SENT_BACK (resume)
 *   mentor may request a resubmission → RESUBMISSION_REQUESTED (withdrawable)
 * Admins never grade; mentors cannot publish.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileText, History } from "lucide-react";
import { useReviewAction, useReviewCycles, useReviewSubmission } from "@/lib/queries/mentor";
import { REVIEW_RULES, reviewsApi } from "@/lib/api/mentor";
import { saveFile } from "@/lib/api/client";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { formatDateTime, personName } from "@/lib/format";
import type { ReviewSubmission } from "@/lib/api/types";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import FeedbackEditor from "./components/FeedbackEditor";
import ScoreInput from "./components/ScoreInput";
import SubmissionActions from "./components/SubmissionActions";
import { ReviewStatusBadge } from "../../../../components/mentorUi";

type Success = { title: string; body: string } | null;

export default function GradingView({ assignmentId, submissionId }: { assignmentId: string; submissionId: string }) {
  const sub = useReviewSubmission(submissionId);
  // Kept here: the form below remounts when the saved review changes.
  const [success, setSuccess] = useState<Success>(null);

  if (sub.isPending) return <LoadingBlock label="Loading submission…" />;
  if (sub.isError) {
    const notFound = isApiError(sub.error) && [400, 403, 404].includes(sub.error.status);
    return (
      <div className="min-h-screen bg-[#E6EBF2] p-8 space-y-6">
        <Link href={`/mentor/assignments/${assignmentId}/assignmentReview`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Submissions
        </Link>
        {notFound ? (
          <div className="bg-white rounded-2xl border border-gray-200">
            <EmptyState
              title="Submission not available"
              description={isApiError(sub.error) && sub.error.code === "NOT_ASSIGNED_MENTOR" ? "This submission is assigned to another coach." : "It doesn't exist or isn't assigned to you."}
            />
          </div>
        ) : (
          <ErrorState error={sub.error} onRetry={() => sub.refetch()} />
        )}
      </div>
    );
  }

  // Remount the form when the review cycle or status changes, so it starts from the saved values.
  return (
    <Grading
      key={`${sub.data.review?.id}:${sub.data.review?.status}:${sub.data.review?.markedAt}`}
      s={sub.data}
      assignmentId={assignmentId}
      success={success}
      setSuccess={setSuccess}
    />
  );
}

function Grading({
  s,
  assignmentId,
  success,
  setSuccess,
}: {
  s: ReviewSubmission;
  assignmentId: string;
  success: Success;
  setSuccess: (v: Success) => void;
}) {
  const review = s.review;
  const status = review?.status ?? null;
  const editable = status === "IN_PROGRESS" || status === "MARKED";
  const cycles = useReviewCycles(s.id);
  const action = useReviewAction(s.id);

  const [score, setScore] = useState(review?.score !== null && review?.score !== undefined ? String(review.score) : "");
  const [feedback, setFeedback] = useState(review?.feedback ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [localErrors, setLocalErrors] = useState<{ score?: string; feedback?: string }>({});
  const [attemptIdx, setAttemptIdx] = useState(s.revisions.length - 1);

  const attempt = s.revisions[attemptIdx] ?? null;
  const max = s.assignment.maximumMarks;
  const server = fieldErrors(action.error, ["score", "mentorFeedback"]);
  const busy = action.isPending ? (action.variables?.type ?? "busy") : null;

  function validate(): boolean {
    const e: { score?: string; feedback?: string } = {};
    const n = Number(score);
    if (score === "" || !Number.isInteger(n) || n < 0 || n > max) e.score = `Enter a whole number from 0 to ${max}.`;
    const f = feedback.trim().length;
    if (f < REVIEW_RULES.feedback.min || f > REVIEW_RULES.feedback.max) e.feedback = "Feedback must be 2–10,000 characters.";
    setLocalErrors(e);
    return Object.keys(e).length === 0;
  }

  function save(andSubmit: boolean) {
    if (!validate()) return;
    action.mutate(
      { type: andSubmit ? "markAndSubmit" : "mark", score: Number(score), feedback, files },
      {
        onSuccess: () => {
          setFiles([]);
          setSuccess(
            andSubmit
              ? { title: "Review sent to the administrator", body: "They will approve it and publish the result to the student." }
              : { title: "Mark saved", body: "You can still change it until you send the review to the administrator." },
          );
        },
      },
    );
  }

  async function downloadAll() {
    if (!attempt) return;
    for (const att of attempt.attachments) saveFile(await reviewsApi.submissionFile(s.id, att.id, att.file.originalName));
  }

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 md:p-8 text-gray-800 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        <Link href={`/mentor/assignments/${assignmentId}/assignmentReview`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Submissions</span>
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-gray-900 break-words">
                {personName(s.student)} - {s.assignment.title}
              </h1>
              <ReviewStatusBadge status={s.status} />
            </div>
            <p className="text-gray-500 mt-1 text-sm">
              Submitted on {formatDateTime(s.submittedAt)}
              {s.isLate && <span className="text-orange-600 font-semibold"> · late</span>}
            </p>
          </div>
          {attempt && attempt.attachments.length > 0 && (
            <button
              type="button"
              onClick={downloadAll}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm font-medium border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors self-start md:self-auto"
            >
              <span>Download Submission</span>
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>

        {status === "SENT_BACK" && review?.decisionNote && (
          <Alert tone="error">
            <strong>Sent back by the administrator:</strong> {review.decisionNote}
          </Alert>
        )}
        {status === "RESUBMISSION_REQUESTED" && s.resubmissionRequest && (
          <Alert tone="info">
            You asked for a new attempt (due {formatDateTime(s.resubmissionRequest.dueAt)}): “{s.resubmissionRequest.note}”. The new attempt comes back to you.
          </Alert>
        )}
        {(status === "RETURNED" || status === "APPROVED" || status === "PUBLISHED") && (
          <Alert tone="success">
            {status === "RETURNED"
              ? "Your review is with the administrator for approval."
              : status === "APPROVED"
                ? "The administrator approved your review. It will be published to the student."
                : "The result has been published to the student."}
          </Alert>
        )}
        {action.isError && Object.keys(server).length === 0 && <Alert tone="error">{errorMessage(action.error)}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Student submission */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100/50">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Student Submission</h2>
                {s.revisions.length > 1 && (
                  <div className="flex gap-1" role="tablist" aria-label="Attempts">
                    {s.revisions.map((r, i) => (
                      <button
                        key={r.id}
                        type="button"
                        role="tab"
                        aria-selected={i === attemptIdx}
                        onClick={() => setAttemptIdx(i)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold ${i === attemptIdx ? "bg-indigo-700 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                      >
                        Attempt {r.revisionNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {attempt ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-400">
                    Attempt {attempt.revisionNumber} · {formatDateTime(attempt.submittedAt)}
                    {attempt.isLate && " · late"}
                  </p>
                  {attempt.answerText && <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm text-gray-700 whitespace-pre-line max-h-80 overflow-y-auto">{attempt.answerText}</div>}
                  {attempt.note && (
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold">Student note:</span> {attempt.note}
                    </p>
                  )}
                  {attempt.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {attempt.attachments.map((att) => (
                        <FileButton key={att.id} file={att.file} fetchFile={() => reviewsApi.submissionFile(s.id, att.id, att.file.originalName)} />
                      ))}
                    </div>
                  ) : (
                    !attempt.answerText && <p className="text-sm text-gray-400">This attempt has no files or text.</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <FileText className="w-5 h-5" /> No attempt found.
                </div>
              )}
            </div>

            <FeedbackEditor
              submissionId={s.id}
              value={feedback}
              onChange={setFeedback}
              files={files}
              onFiles={setFiles}
              existing={review?.attachments ?? []}
              onRemoveExisting={(attachmentId) => action.mutate({ type: "removeFeedbackFile", attachmentId })}
              disabled={!editable || !!busy}
              error={localErrors.feedback ?? server.mentorFeedback}
            />

            <ScoreInput value={score} onChange={setScore} maxScore={max} disabled={!editable || !!busy} error={localErrors.score ?? server.score} />
          </div>

          {/* Right column */}
          <div className="flex flex-col space-y-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100/50 space-y-5">
              <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Submission Details</h2>
              <div className="space-y-4 text-sm">
                <Detail label="Student" value={`${personName(s.student)}${s.student.gradeLevel ? ` · ${s.student.gradeLevel}` : ""}`} />
                <Detail label="Due Date" value={formatDateTime(s.assignment.deadline)} />
                <Detail label="Submitted" value={formatDateTime(s.submittedAt) + (s.isLate ? " (late)" : "")} />
                <Detail label="Attempts" value={String(s.revisions.length)} />
                <Detail label="Review cycle" value={review ? `#${review.cycle}` : "—"} />
                <Detail label="Assigned to you" value={formatDateTime(review?.assignedAt)} />
                {review?.markedAt && <Detail label="Last marked" value={formatDateTime(review.markedAt)} />}
              </div>
            </div>

            <SubmissionActions
              status={status}
              busy={busy}
              allowResubmission={s.assignment.allowResubmission}
              onStart={() => action.mutate({ type: "start" })}
              onSave={() => save(false)}
              onSend={() => save(true)}
              onRequestResubmission={(note, dueAt) =>
                action.mutate(
                  { type: "requestResubmission", note, dueAt },
                  { onSuccess: () => setSuccess({ title: "Resubmission requested", body: "The student has been notified and can submit a new attempt." }) },
                )
              }
              onWithdraw={() => action.mutate({ type: "withdrawResubmission" })}
              successMessage={success}
              onCloseSuccess={() => setSuccess(null)}
            />

            {/* Review history */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100/50">
              <h2 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <History className="w-4 h-4" /> Review History
              </h2>
              {cycles.isPending ? (
                <p className="text-xs text-gray-400">Loading…</p>
              ) : cycles.isError ? (
                <p className="text-xs text-red-600">{errorMessage(cycles.error)}</p>
              ) : (
                <ol className="space-y-3">
                  {cycles.data.map((c) => (
                    <li key={c.id} className="text-xs">
                      <p className="font-semibold text-gray-800">
                        Cycle {c.cycle} · {c.status.replace(/_/g, " ").toLowerCase()}
                        {c.score !== null && ` · ${c.score}/${max}`}
                      </p>
                      <ul className="mt-1 space-y-0.5 text-gray-500">
                        {c.events.map((e) => (
                          <li key={e.id}>
                            {formatDateTime(e.createdAt)} — {e.type.replace(/_/g, " ").toLowerCase()}
                            {e.actor && ` by ${personName(e.actor)}`}
                            {e.note && `: ${e.note}`}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className="text-gray-700 font-medium mt-0.5">{value}</p>
    </div>
  );
}
