"use client";

/**
 * A teacher's test submission for their students (owner 2026-11-21, capability testSubmissionLock): on by default for
 * every teacher. An Administrator (users.manageTeachers) turns it off — with a reason, audited — or back on, in one
 * switch. The account itself is untouched: the teacher still signs in and still sees their students.
 *
 *   GET /admin/teachers/:id/test-submission   { allowed, revokedAt, reason, revokedBy }
 *   PUT /admin/teachers/:id/test-submission   { allowed: false, reason } | { allowed: true }
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teachersAdminApi } from "@/lib/api/accounts";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDateTime, personName } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";
import { resubmissionReasonProblem } from "@/lib/test-management/submissions";
import { Alert, LoadingBlock } from "@/app/components/ui/feedback";
import { Card, btnPrimary, btnSecondary } from "../../components/adminUi";

const ERRORS: Record<string, string> = {
  OVERRIDE_NOT_ALLOWED: "This can't be changed here: the account is not a teacher, or it is your own account.",
  REASON_REQUIRED: "Give a reason (3–500 characters).",
};

export default function TeacherTestSubmissionCard({ teacherId }: { teacherId: string }) {
  const qc = useQueryClient();
  const key = queryKeys.accounts.teacherTestSubmission(teacherId);
  const state = useQuery({ queryKey: key, queryFn: () => teachersAdminApi.testSubmission(teacherId) });
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const change = useMutation({
    mutationFn: (allowed: boolean) => teachersAdminApi.setTestSubmission(teacherId, allowed ? { allowed: true } : { allowed: false, reason: reason.trim() }),
    onSuccess: (next) => {
      qc.setQueryData(key, next);
      void qc.invalidateQueries({ queryKey: queryKeys.accounts.all });
      setAsking(false);
      setReason("");
    },
  });

  function revoke(e: FormEvent) {
    e.preventDefault();
    const p = resubmissionReasonProblem(reason);
    setProblem(p);
    if (!p) change.mutate(false);
  }

  return (
    <Card className="p-5" >
      <section aria-labelledby="teacher-test-submission-h" data-testid="teacher-test-submission">
        <h2 id="teacher-test-submission-h" className="text-sm font-bold text-gray-900">Test submission for students</h2>
        <p className="mt-0.5 text-xs text-gray-600">On by default: the teacher can submit tests for the students of their school. Turning it off does not deactivate the account.</p>
        {state.isPending ? <LoadingBlock /> : state.isError ? <div className="mt-3"><Alert tone="error">{errorMessage(state.error)}</Alert></div> : (
          <div className="mt-3 space-y-3 text-sm">
            <p className="flex flex-wrap items-center gap-2" data-testid="teacher-test-submission-state">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${state.data.allowed ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
                {state.data.allowed ? "Allowed" : "Turned off"}
              </span>
              {!state.data.allowed && state.data.revokedAt && (
                <span className="text-xs text-gray-700">
                  since {formatDateTime(state.data.revokedAt)}{state.data.revokedBy && ` by ${personName(state.data.revokedBy)}`}{state.data.reason && ` — ${state.data.reason}`}
                </span>
              )}
            </p>
            {change.error != null && <Alert tone="error">{(isApiError(change.error) && change.error.code && ERRORS[change.error.code]) || errorMessage(change.error)}</Alert>}
            {state.data.allowed ? (
              asking ? (
                <form onSubmit={revoke} noValidate className="space-y-2">
                  <label htmlFor="tts-reason" className="block text-xs font-semibold text-gray-800">Reason (kept in the audit log)</label>
                  <textarea id="tts-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="For example: submitted for students of another school"
                    aria-invalid={problem ? true : undefined} aria-describedby={problem ? "tts-reason-error" : undefined} data-testid="teacher-test-submission-reason" />
                  {problem && <p id="tts-reason-error" className="text-xs text-red-700">{problem}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={btnPrimary} disabled={change.isPending} data-testid="teacher-test-submission-confirm">{change.isPending ? "Turning off…" : "Turn off"}</button>
                    <button type="button" className={btnSecondary} onClick={() => { setAsking(false); setProblem(undefined); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" className={btnSecondary} onClick={() => setAsking(true)} data-testid="teacher-test-submission-revoke">Turn off test submission</button>
              )
            ) : (
              <button type="button" className={btnPrimary} onClick={() => change.mutate(true)} disabled={change.isPending} data-testid="teacher-test-submission-restore">
                {change.isPending ? "Turning on…" : "Turn test submission back on"}
              </button>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}
