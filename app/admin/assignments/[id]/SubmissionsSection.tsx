"use client";

import { useState, type FormEvent } from "react";
import { Shuffle } from "lucide-react";
import { REASSIGNABLE } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/errors";
import type { AdminSubmission, DistributionStrategy, MentorAssignment, SubmissionStatus } from "@/lib/api/types";
import { useAdminSubmissions, useAssignSubmission, useDistribute, useDistributionBatches, useScopeMentors } from "@/lib/queries/admin";
import { formatDateTime, personName } from "@/lib/format";
import { Alert, ErrorState, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, Card, FilterPills, Modal, Notice, SubmissionBadge, TableCard, TableMessage, btnPrimary, linkBtn, td, th } from "../../components/adminUi";

const STATUS_TABS: { label: string; value: "" | SubmissionStatus }[] = [
  { label: "All", value: "" },
  { label: "Awaiting distribution", value: "SUBMITTED" },
  { label: "With mentor", value: "ASSIGNED" },
  { label: "In review", value: "IN_REVIEW" },
  { label: "Marked", value: "MARKED" },
  { label: "Awaiting approval", value: "SUBMITTED_TO_ADMIN" },
  { label: "Sent back", value: "REJECTED" },
  { label: "Resubmission requested", value: "RESUBMISSION_REQUESTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Published", value: "PUBLISHED" },
];

/** Assign (SUBMITTED) or reassign (open review) one submission. */
function AssignDialog({ submission, assignment, onClose, onDone }: { submission: AdminSubmission; assignment: MentorAssignment; onClose: () => void; onDone: (msg: string) => void }) {
  const mentors = useScopeMentors(assignment.courseId, assignment.divisionId);
  const assign = useAssignSubmission();
  const reassign = submission.status !== "SUBMITTED";
  const current = submission.review?.mentor?.id;
  const [mentorId, setMentorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = (mentors.data ?? []).filter((m) => m.id !== current);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!mentorId) return setError("Choose a mentor.");
    setError(null);
    try {
      await assign.mutateAsync({ submissionId: submission.id, mentorId, reassign });
      const m = options.find((o) => o.id === mentorId);
      onDone(`${personName(submission.student)}'s submission ${reassign ? "reassigned" : "assigned"} to ${personName(m)}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title={reassign ? "Reassign to another mentor" : "Assign to a mentor"} onClose={assign.isPending ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">
          {personName(submission.student)}&apos;s submission.{" "}
          {reassign ? `Currently with ${personName(submission.review?.mentor, "no mentor")}. The current review is closed and a new review cycle starts with the new mentor.` : "The mentor is notified and can start the review."}
        </p>
        {mentors.isPending ? (
          <Spinner />
        ) : mentors.isError ? (
          <Alert tone="error">{errorMessage(mentors.error)}</Alert>
        ) : options.length === 0 ? (
          <Alert tone="info">No other mentor has access to {assignment.course.title} · {assignment.division.name}. Add course access on the Mentors page first.</Alert>
        ) : (
          <label className="block text-xs font-semibold text-gray-600">
            Mentor
            <select value={mentorId} onChange={(e) => setMentorId(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal">
              <option value="">Choose a mentor…</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {personName(m)} (@{m.username})
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-gray-600">
            Cancel
          </button>
          <button type="submit" disabled={assign.isPending || options.length === 0} className={btnPrimary}>
            {assign.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            {reassign ? "Reassign" : "Assign"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Distribute every submission awaiting distribution (`POST /assignments/:id/distribute`). */
function DistributeDialog({ assignment, waiting, onClose, onDone }: { assignment: MentorAssignment; waiting: number; onClose: () => void; onDone: (msg: string) => void }) {
  const mentors = useScopeMentors(assignment.courseId, assignment.divisionId);
  const distribute = useDistribute(assignment.id);
  const [strategy, setStrategy] = useState<"" | DistributionStrategy>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const r = await distribute.mutateAsync({ strategy: strategy || undefined, mentorIds: selected.length ? selected : undefined });
      const names = (mentors.data ?? []).filter((m) => r.byMentor[m.id]).map((m) => `${personName(m)} (${r.byMentor[m.id]})`);
      onDone(`${r.distributed} submission${r.distributed === 1 ? "" : "s"} distributed${names.length ? `: ${names.join(", ")}` : ""}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Distribute submissions" onClose={distribute.isPending ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-600">
          {waiting} submission{waiting === 1 ? "" : "s"} awaiting distribution will be assigned to mentors of {assignment.course.title} · {assignment.division.name}.
        </p>
        <label className="block text-xs font-semibold text-gray-600">
          Strategy
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as "" | DistributionStrategy)} className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal">
            <option value="">Platform default (settings)</option>
            <option value="BALANCED">Balanced — fewest open reviews first</option>
            <option value="ROUND_ROBIN">Round robin — in turn</option>
          </select>
        </label>
        <fieldset>
          <legend className="text-xs font-semibold text-gray-600 mb-1">Mentors (optional — all eligible mentors when none is ticked)</legend>
          {mentors.isPending ? (
            <Spinner />
          ) : mentors.isError ? (
            <Alert tone="error">{errorMessage(mentors.error)}</Alert>
          ) : (mentors.data ?? []).length === 0 ? (
            <Alert tone="info">No mentor has access to this course and division yet.</Alert>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {mentors.data!.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.includes(m.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))} />
                  {personName(m)} <span className="text-gray-400 text-xs">@{m.username}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-gray-600">
            Cancel
          </button>
          <button type="submit" disabled={distribute.isPending || (mentors.data ?? []).length === 0} className={btnPrimary}>
            {distribute.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Distribute
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Submissions of one assignment: distribution, assignment and review status (admin view). */
export default function SubmissionsSection({ assignment }: { assignment: MentorAssignment }) {
  const [status, setStatus] = useState<"" | SubmissionStatus>("");
  const [page, setPage] = useState(1);
  const [assigning, setAssigning] = useState<AdminSubmission | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const subs = useAdminSubmissions({ assignmentId: assignment.id, status: status || undefined, page, limit: 20 });
  const waitingQ = useAdminSubmissions({ assignmentId: assignment.id, status: "SUBMITTED", limit: 1 });
  const batches = useDistributionBatches(assignment.id);
  const waiting = waitingQ.data?.meta.total ?? 0;
  const archived = assignment.status === "ARCHIVED";

  return (
    <section aria-labelledby="subs-title" className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 id="subs-title" className="text-xl font-bold text-gray-900">
            Submissions
          </h2>
          <p className="text-xs text-gray-500">Distribute student work to mentors, follow reviews and open a review to approve it.</p>
        </div>
        {!archived && waiting > 0 && (
          <button type="button" onClick={() => setDistributing(true)} className={btnPrimary}>
            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" /> Distribute {waiting} submission{waiting === 1 ? "" : "s"}
          </button>
        )}
      </div>
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}
      <div className="mb-4 overflow-x-auto pb-1">
        <FilterPills
          label="Submission status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={STATUS_TABS}
        />
      </div>
      {subs.isError ? (
        <ErrorState error={subs.error} title="Couldn't load submissions" onRetry={() => subs.refetch()} />
      ) : (
        <TableCard
          footer={
            subs.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={subs.data.meta.totalPages} total={subs.data.meta.total} onPage={setPage} disabled={subs.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Student</th>
              <th className={th}>Submitted</th>
              <th className={th}>Mentor</th>
              <th className={th}>Status</th>
              <th className={th}>Score</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${subs.isFetching && subs.data ? "opacity-60" : ""}`}>
            {subs.isPending ? (
              <TableMessage colSpan={6}>Loading submissions…</TableMessage>
            ) : subs.data.data.length === 0 ? (
              <TableMessage colSpan={6}>{status ? "No submissions in this state." : "No submissions yet."}</TableMessage>
            ) : (
              subs.data.data.map((s) => {
                const canAssign = !archived && s.status === "SUBMITTED";
                const canReassign = !archived && REASSIGNABLE.includes(s.status);
                return (
                  <tr key={s.id} className="text-xs hover:bg-gray-50/60">
                    <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>
                      {personName(s.student)}
                      <span className="block text-[11px] font-normal text-gray-400">
                        @{s.student.username}
                        {s.student.gradeLevel && ` · ${s.student.gradeLevel}`}
                      </span>
                    </td>
                    <td className={`${td} text-gray-500 whitespace-nowrap`}>
                      {formatDateTime(s.submittedAt)}
                      <span className="block text-[11px]">
                        {s.revisionCount > 1 ? `${s.revisionCount} attempts` : "1 attempt"}
                        {s.isLate && <Badge className="ml-1 bg-red-50 text-red-600">Late</Badge>}
                      </span>
                    </td>
                    <td className={`${td} text-gray-600 whitespace-nowrap`}>{s.review?.mentor ? personName(s.review.mentor) : "—"}</td>
                    <td className={td}>
                      <SubmissionBadge status={s.status} />
                    </td>
                    <td className={`${td} text-gray-600 whitespace-nowrap`}>{s.review?.score != null ? `${s.review.score} / ${assignment.maximumMarks}` : "—"}</td>
                    <td className={td}>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        {(canAssign || canReassign) && (
                          <button type="button" onClick={() => setAssigning(s)} className={linkBtn}>
                            {canAssign ? "Assign" : "Reassign"}
                          </button>
                        )}
{/* OPEN_LINK */}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}

      {batches.data && batches.data.length > 0 && (
        <Card className="p-6 mt-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Distribution history</h3>
          <ul className="space-y-2 text-xs text-gray-600">
            {batches.data.map((b) => (
              <li key={b.id}>
                {formatDateTime(b.createdAt)} · {b.assignedCount} submission{b.assignedCount === 1 ? "" : "s"} · {b.strategy === "BALANCED" ? "balanced" : "round robin"} · by @{b.createdBy?.username ?? "—"}
                {b.reviews.length > 0 && <span className="text-gray-400"> — {[...new Set(b.reviews.map((r) => `@${r.mentor?.username ?? "?"}`))].join(", ")}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {assigning && <AssignDialog submission={assigning} assignment={assignment} onClose={() => setAssigning(null)} onDone={setNotice} />}
      {distributing && <DistributeDialog assignment={assignment} waiting={waiting} onClose={() => setDistributing(false)} onDone={setNotice} />}
    </section>
  );
}
