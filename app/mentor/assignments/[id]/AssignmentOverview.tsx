"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit, Users, Clock, CheckCircle2, AlertCircle, FileText, Calendar, BarChart3, Send, Undo2, History } from "lucide-react";
import { useAssignmentHistory, useAssignmentTransition, useCourseAnalytics, useMentorAssignment, useReviewQueue } from "@/lib/queries/mentor";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { hasFeature } from "@/lib/api/capabilities";
import { mentorAssignmentsApi } from "@/lib/api/mentor";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDateTime, personName } from "@/lib/format";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import DiscussionPanel from "@/app/components/discussions/DiscussionPanel";
import { ASSIGNMENT_STATUS, AssignmentStatusBadge, DONE_REVIEW_STATUSES, OPEN_REVIEW_STATUSES } from "../../components/mentorUi";

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Edited",
  ATTACHMENT_ADDED: "File added",
  ATTACHMENT_REMOVED: "File removed",
  SUBMITTED_FOR_REVIEW: "Submitted for approval",
  RECALLED: "Recalled to draft",
  PUBLISHED: "Published",
  REJECTED: "Returned by administrator",
  UNPUBLISHED: "Unpublished",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  ARCHIVED: "Archived",
};

export default function AssignmentOverview({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const assignment = useMentorAssignment(assignmentId);
  const history = useAssignmentHistory(assignmentId);
  // With reviewQueueFilters the totals come from the server (`counts`); otherwise from the first 100 rows.
  const caps = useBackendCapabilities();
  const serverCounts = hasFeature(caps.detection, "reviewQueueFilters");
  const queue = useReviewQueue(serverCounts ? { assignmentId, group: "all", limit: 1 } : { assignmentId, limit: 100 }, { enabled: !caps.loading });
  const analytics = useCourseAnalytics(assignment.data?.courseId, assignment.data?.divisionId);
  const transition = useAssignmentTransition(assignmentId);
  const [notice, setNotice] = useState<string | null>(null);

  const reviewCounts = useMemo(() => {
    const server = queue.data?.counts;
    if (server) return { assigned: server.all, toReview: server.open, done: server.done };
    const items = queue.data?.data ?? [];
    return {
      assigned: items.length,
      toReview: items.filter((s) => OPEN_REVIEW_STATUSES.includes(s.status)).length,
      done: items.filter((s) => DONE_REVIEW_STATUSES.includes(s.status)).length,
    };
  }, [queue.data]);

  if (assignment.isPending) return <LoadingBlock label="Loading assignment…" />;
  if (assignment.isError) {
    const notFound = isApiError(assignment.error) && [400, 403, 404].includes(assignment.error.status);
    return (
      <div className="p-6 md:p-10 space-y-6 bg-[#E6EBF2] min-h-screen">
        <Link href="/mentor/assignments" className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Assignments
        </Link>
        {notFound ? (
          <div className="bg-white rounded-2xl border border-gray-200">
            <EmptyState title="Assignment not found" description="It doesn't exist or isn't in one of your courses." />
          </div>
        ) : (
          <ErrorState error={assignment.error} onRetry={() => assignment.refetch()} />
        )}
      </div>
    );
  }

  const a = assignment.data;
  const editable = a.status === "DRAFT" || a.status === "REJECTED";
  const reviewable = a.status === "PUBLISHED" || a.status === "CLOSED" || a.status === "ARCHIVED";
  const stats = analytics.data?.assignments.find((x) => x.id === a.id);
  const totalStudents = analytics.data?.students.total;

  function run(action: "submit" | "recall") {
    setNotice(null);
    transition.mutate(action, {
      onSuccess: () => setNotice(action === "submit" ? "Submitted for approval. An administrator will publish it." : "Recalled to draft. You can edit it again."),
    });
  }

  return (
    <div className="min-h-screen p-4 md:p-10 font-sans bg-[#E6EBF2]">
      <div className="max-w-7xl mx-auto space-y-6">
        <button
          type="button"
          onClick={() => router.push("/mentor/assignments")}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Assignments
        </button>

        {notice && <Alert tone="success">{notice}</Alert>}
        {transition.isError && <Alert tone="error">{errorMessage(transition.error)}</Alert>}
        {a.status === "REJECTED" && (
          <Alert tone="error">
            <strong>Returned by an administrator.</strong> {a.rejectionNote ?? "No note was given."} Edit the assignment and submit it again.
          </Alert>
        )}
        {a.status === "PENDING_APPROVAL" && (
          <Alert tone="info">Waiting for an administrator to publish it. Recall it to make changes.</Alert>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900 break-words">{a.title}</h1>
                <AssignmentStatusBadge status={a.status} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>Created {formatDateTime(a.createdAt)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>Due {formatDateTime(a.deadline)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>
                    {a.course.title} · {a.division.name} division{totalStudents !== undefined && ` · ${totalStudents} students`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {reviewable && (
                <Link
                  href={`/mentor/assignments/${a.id}/assignmentReview`}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
                >
                  Review Submissions
                </Link>
              )}
              {editable && (
                <>
                  <Link
                    href={`/mentor/assignments/${a.id}/edit`}
                    className="px-6 py-3 bg-white border-2 border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => run("submit")}
                    disabled={transition.isPending}
                    className="px-6 py-3 bg-indigo-700 text-white rounded-xl font-semibold text-sm hover:bg-indigo-800 transition-colors flex items-center gap-2 disabled:opacity-60"
                  >
                    {transition.isPending ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="w-4 h-4" />}
                    Submit for approval
                  </button>
                </>
              )}
              {a.status === "PENDING_APPROVAL" && (
                <button
                  type="button"
                  onClick={() => run("recall")}
                  disabled={transition.isPending}
                  className="px-6 py-3 bg-white border-2 border-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  {transition.isPending ? <Spinner className="h-4 w-4" /> : <Undo2 className="w-4 h-4" />}
                  Recall to draft
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat icon={<Users className="w-5 h-5 text-blue-600" />} tone="bg-blue-100" value={totalStudents ?? "—"} label="Students in division" />
          <Stat icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} tone="bg-green-100" value={a._count?.submissions ?? stats?.submissions ?? 0} label="Submitted" />
          <Stat icon={<AlertCircle className="w-5 h-5 text-purple-600" />} tone="bg-purple-100" value={reviewCounts.toReview} label="To review (you)" />
          <Stat icon={<FileText className="w-5 h-5 text-amber-600" />} tone="bg-amber-100" value={reviewCounts.done} label="Reviewed (you)" />
          <Stat
            icon={<BarChart3 className="w-5 h-5 text-indigo-600" />}
            tone="bg-indigo-100"
            value={stats?.averagePercentage !== null && stats?.averagePercentage !== undefined ? `${Math.round(stats.averagePercentage)}%` : "—"}
            label="Avg. published score"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Description</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{a.description || "—"}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Instructions</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-line">{a.instructions}</p>
            </div>
            {a.attachments.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Files</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {a.attachments.map((att) => (
                    <FileButton key={att.id} file={att.file} fetchFile={() => mentorAssignmentsApi.briefFile(a.id, att.id, att.file.originalName)} />
                  ))}
                </div>
              </div>
            )}
            {reviewable && (
              <section className="space-y-4" aria-labelledby="assignment-discussion">
                <h2 id="assignment-discussion" className="text-xl font-bold text-gray-900">Discussion</h2>
                <DiscussionPanel scope={{ kind: "assignment", assignmentId: a.id }} banner="Questions from students about this assignment. Don't share answers." />
              </section>
            )}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-500" /> History
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
                        <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800">
                            {EVENT_LABEL[ev.type] ?? ev.type}
                            {ev.toStatus && ev.fromStatus && ev.toStatus !== ev.fromStatus && (
                              <span className="font-normal text-gray-500">
                                {" "}
                                · {ASSIGNMENT_STATUS[ev.fromStatus]?.label ?? ev.fromStatus} → {ASSIGNMENT_STATUS[ev.toStatus]?.label ?? ev.toStatus}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatDateTime(ev.createdAt)} · {personName(ev.actor, "System")}
                          </p>
                          {ev.note && <p className="text-xs text-gray-600 mt-0.5">{ev.note}</p>}
                          {ev.changes && Object.keys(ev.changes).length > 0 && <p className="text-xs text-gray-500 mt-0.5">Changed: {Object.keys(ev.changes).join(", ")}</p>}
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </div>

          {/* Info panel */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Assignment Info</h3>
              <div className="space-y-3">
                <Info label="Course" value={a.course.title} />
                <Info label="Division" value={`${a.division.name} division`} />
                <Info label="Academic year" value={a.academicYear.name} />
                <Info label="Maximum marks" value={String(a.maximumMarks)} />
                <Info label="Leaderboard points" value={String(a.points)} />
                <Info label="Resubmission" value={a.allowResubmission ? (a.maxResubmissions > 0 ? `Allowed (up to ${a.maxResubmissions})` : "Allowed (unlimited)") : "Not allowed"} />
                <Info label="Late submissions" value={a.allowLateSubmission ? "Accepted" : "Not accepted"} />
                <Info label="Prepared by" value={personName(a.createdBy)} />
                {a.publishedAt && <Info label="Published" value={formatDateTime(a.publishedAt)} />}
                <Info label="Status" value={ASSIGNMENT_STATUS[a.status].label} />
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Workflow</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Draft → Submit for approval → an administrator publishes (or returns it with a note) → students submit → an administrator distributes the work to
                coaches → you review and submit each review to the administrator, who approves and publishes the results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, tone, value, label }: { icon: React.ReactNode; tone: string; value: React.ReactNode; label: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200/80">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${tone} flex items-center justify-center shrink-0`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-600">{label}</p>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}
