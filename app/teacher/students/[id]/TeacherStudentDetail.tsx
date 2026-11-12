"use client";

/**
 * One student of the teacher's schools. Every section needs its own
 * Administrator-granted permission and is requested only when it is held:
 * - profile   students.viewProfile   (`GET /teacher/students/:id`)
 * - progress  students.viewProgress  (`GET /teacher/students/:id/progress`): assignments and
 *             attempts — never scores or feedback; each attempt shows who actually sent it
 * - submit    submissions.submitOnBehalf (`POST /teacher/students/:id/submissions`): the
 *             student stays the owner, the teacher is recorded as the submitter
 * Choosing an assignment to submit needs the progress list (no other teacher
 * route lists a student's assignments). The action is hidden, with the reason,
 * when the progress data already shows the backend would refuse it
 * (lib/teacher/on-behalf); the backend enforces every rule regardless.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SUBMISSION_UPLOAD } from "@/lib/api/assessment";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { OnBehalfSubmission, Submitter, TeacherProgressAssignment } from "@/lib/api/teacher";
import { roleLabel } from "@/lib/auth/roles";
import { useSession } from "@/lib/auth/session";
import { useNow } from "@/lib/hooks/useNow";
import { onBehalfEligibility } from "@/lib/teacher/on-behalf";
import { formatDateTime, personName } from "@/lib/format";
import { useSubmitOnBehalf, useTeacherStudentProfile, useTeacherStudentProgress } from "@/lib/queries/teacher";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FilePicker from "@/app/components/ui/FilePicker";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Card, Notice, SubmissionBadge, btnPrimary, btnSecondary, td, th, TableCard } from "@/app/admin/components/adminUi";

export default function TeacherStudentDetail({ studentId }: { studentId: string }) {
  const { can, user } = useSession();
  const mayProfile = can("students.viewProfile");
  const mayProgress = can("students.viewProgress");
  const maySubmit = can("submissions.submitOnBehalf");

  const profile = useTeacherStudentProfile(studentId, mayProfile);
  const progress = useTeacherStudentProgress(studentId, mayProgress);
  const notFound = [profile.error, progress.error].some((e) => isApiError(e) && e.status === 404);

  const name = profile.data ? personName(profile.data) : progress.data ? `@${progress.data.student.username}` : "Student";

  const back = (
    <Link href="/teacher/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> My students
    </Link>
  );

  if (!mayProfile && !mayProgress && !maySubmit) {
    return (
      <PageFrame title="Student">
        {back}
        <Notice tone="info">An administrator has not granted you permission to open students&apos; details.</Notice>
      </PageFrame>
    );
  }

  if (notFound) {
    return (
      <PageFrame title="Student">
        {back}
        <Notice tone="info">This student is not in one of your schools.</Notice>
      </PageFrame>
    );
  }

  return (
    <PageFrame title={name} description="A student of your schools.">
      {back}
      <div className="space-y-6">
        {mayProfile && (
          <section aria-labelledby="profile-h">
            <h2 id="profile-h" className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Profile</h2>
            {profile.isPending ? (
              <LoadingBlock />
            ) : profile.isError ? (
              <ErrorState error={profile.error} title="Couldn't load the profile" onRetry={() => profile.refetch()} />
            ) : (
              <Card className="p-5">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm" data-testid="teacher-student-profile">
                  <Row label="Name">{personName(profile.data)}</Row>
                  <Row label="Username">@{profile.data.username}</Row>
                  <Row label="Grade">{profile.data.gradeLevel ?? "—"}</Row>
                  <Row label="Division">{profile.data.division?.name ?? "—"}</Row>
                  <Row label="School">{profile.data.school?.name ?? "—"}</Row>
                  <Row label="Account">
                    {!profile.data.account.isActive ? "Suspended" : !profile.data.account.activated ? "Not activated yet" : !profile.data.account.isApproved ? "Awaiting approval" : "Active"}
                  </Row>
                  <Row label="Enrolment">
                    {profile.data.currentEnrolment ? `${profile.data.currentEnrolment.academicYear.name} · ${profile.data.currentEnrolment.status}` : "—"}
                  </Row>
                  <Row label="Last sign-in">{formatDateTime(profile.data.account.lastLoginAt) || "—"}</Row>
                </dl>
              </Card>
            )}
          </section>
        )}

        {(mayProgress || maySubmit) && (
          <section aria-labelledby="progress-h">
            <h2 id="progress-h" className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Assignments</h2>
            {!mayProgress ? (
              <Notice tone="info">
                You may submit work for this student, but choosing an assignment also needs permission to view the student&apos;s progress. Ask an administrator to grant it.
              </Notice>
            ) : progress.isPending ? (
              <LoadingBlock />
            ) : progress.isError ? (
              <ErrorState error={progress.error} title="Couldn't load the assignments" onRetry={() => progress.refetch()} />
            ) : progress.data.assignments.length === 0 ? (
              <Notice tone="info">No published assignments for this student&apos;s division yet.</Notice>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-500">Scores and feedback are not shown to teachers.</p>
                {progress.data.assignments.map((a) => (
                  <AssignmentCard key={a.id} studentId={studentId} studentName={name} assignment={a} maySubmit={maySubmit} me={user ? { id: user.id, username: user.username } : null} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </PageFrame>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</dt>
      <dd className="text-gray-800 mt-0.5">{children}</dd>
    </div>
  );
}

/** "the student" or "@teacher (Teacher)" — who actually sent an attempt. */
function submitterText(by: Submitter, studentId: string): string {
  return by.id === studentId ? "the student" : `@${by.username} (${roleLabel(by.role)}) on the student's behalf`;
}

function AssignmentCard({
  studentId,
  studentName,
  assignment: a,
  maySubmit,
  me,
}: {
  studentId: string;
  studentName: string;
  assignment: TeacherProgressAssignment;
  maySubmit: boolean;
  me: { id: string; username: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<OnBehalfSubmission | null>(null);
  const now = useNow();
  // Hidden only when the progress data shows the backend would refuse; otherwise the backend decides.
  const eligibility = onBehalfEligibility(a, now);
  const canSubmitHere = maySubmit && eligibility.allowed;

  return (
    <div data-testid="teacher-assignment">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{a.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {a.course.title} · due {formatDateTime(a.deadline)}
              {a.status === "CLOSED" && " · closed"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {a.submission ? <SubmissionBadge status={a.submission.status} /> : <span className="text-xs font-medium text-gray-400">Not submitted</span>}
            {canSubmitHere && !open && (
              <button type="button" className={btnSecondary} onClick={() => { setOpen(true); setDone(null); }}>
                {a.submission ? "Submit a new attempt" : "Submit for this student"}
              </button>
            )}
          </div>
        </div>

        {maySubmit && !eligibility.allowed && !open && (
          <p className="mt-2 text-xs text-gray-500" data-testid="on-behalf-unavailable">
            Can&apos;t submit for this student: {eligibility.reason}
          </p>
        )}

        {a.submission && a.submission.attempts.length > 0 && (
          <TableCard>
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className={th}>Attempt</th>
                <th className={th}>Sent</th>
                <th className={th}>Submitted by</th>
                <th className={th}>Files</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {a.submission.attempts.map((t) => (
                <tr key={t.revisionNumber}>
                  <td className={`${td} text-gray-700`}>#{t.revisionNumber}</td>
                  <td className={`${td} text-gray-600`}>
                    {formatDateTime(t.submittedAt)}
                    {t.isLate && <span className="ml-2 text-[11px] font-semibold text-amber-700">late</span>}
                  </td>
                  <td className={`${td} text-gray-600`} data-testid="attempt-submitter">{submitterText(t.submittedBy, studentId)}</td>
                  <td className={`${td} text-gray-600`}>{t.files}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        )}

        {done && (
          <div className="mt-4">
            <Alert tone="success">
              Submitted for {studentName} — attempt #{done.revisionCount + 1}, {done.isLate ? "late" : "on time"}, {formatDateTime(done.submittedAt)}. Submitted by{" "}
              <strong>@{done.submittedBy.username}</strong> ({roleLabel(done.submittedBy.role)}); the work belongs to {studentName}.
            </Alert>
          </div>
        )}

        {open && (
          <OnBehalfForm
            studentId={studentId}
            studentName={studentName}
            assignmentId={a.id}
            me={me}
            onCancel={() => setOpen(false)}
            onDone={(r) => {
              setDone(r);
              setOpen(false);
            }}
          />
        )}
      </Card>
    </div>
  );
}

function OnBehalfForm({
  studentId,
  studentName,
  assignmentId,
  me,
  onCancel,
  onDone,
}: {
  studentId: string;
  studentName: string;
  assignmentId: string;
  me: { id: string; username: string } | null;
  onCancel: () => void;
  onDone: (r: OnBehalfSubmission) => void;
}) {
  const submit = useSubmitOnBehalf(studentId);
  const [answerText, setAnswerText] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submit.isPending) return;
    if (!answerText.trim() && files.length === 0) return setError("Add the student's answer or at least one file.");
    setError(null);
    submit.mutate(
      { assignmentId, answerText, note, files },
      { onSuccess: onDone, onError: (err) => setError(errorMessage(err)) },
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 border-t border-gray-100 pt-4" noValidate data-testid="on-behalf-form">
      <Notice tone="info">
        You are submitting on behalf of <strong>{studentName}</strong>. The work stays {studentName}&apos;s; you{me ? <> (@{me.username})</> : null} are recorded as the person who sent it.
      </Notice>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1.5">The student&apos;s answer</span>
        <textarea
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          maxLength={SUBMISSION_UPLOAD.answerMax}
          rows={5}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
      </label>
      <FilePicker files={files} onChange={setFiles} rules={SUBMISSION_UPLOAD} />
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1.5">Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={SUBMISSION_UPLOAD.noteMax}
          className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-3">
        <button type="submit" className={btnPrimary} disabled={submit.isPending}>
          {submit.isPending ? "Submitting…" : `Submit for ${studentName}`}
        </button>
        <button type="button" className={btnSecondary} onClick={onCancel} disabled={submit.isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
