"use client";

/**
 * One of a teacher's default rights, switched off and on again by an Administrator (users.manageTeachers): on by default
 * for every teacher; turning it off needs a reason (kept in the audit log); the account itself is untouched — the teacher
 * still signs in and still sees their students. Used for test submission (TeacherTestSubmissionCard) and course homework
 * (TeacherHomeworkSubmissionCard). Both routes answer the same shape: { allowed, revokedAt, reason, revokedBy }.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TeacherSwitchState } from "@/lib/api/accounts";
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

export interface TeacherSwitchText {
  /** data-testid prefix, e.g. "teacher-test-submission". */
  id: string;
  title: string;
  intro: string;
  turnOff: string;
  turnOn: string;
  placeholder: string;
}

export default function TeacherDefaultSwitchCard({ queryKey, load, save, text }: {
  queryKey: readonly unknown[];
  load: () => Promise<TeacherSwitchState>;
  save: (body: { allowed: true } | { allowed: false; reason: string }) => Promise<TeacherSwitchState>;
  text: TeacherSwitchText;
}) {
  const qc = useQueryClient();
  const state = useQuery({ queryKey, queryFn: load });
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | undefined>();
  const change = useMutation({
    mutationFn: (allowed: boolean) => save(allowed ? { allowed: true } : { allowed: false, reason: reason.trim() }),
    onSuccess: (next) => {
      qc.setQueryData(queryKey, next);
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

  const id = text.id;
  return (
    <Card className="p-5" >
      <section aria-labelledby={`${id}-h`} data-testid={id}>
        <h2 id={`${id}-h`} className="text-sm font-bold text-gray-900">{text.title}</h2>
        <p className="mt-0.5 text-xs text-gray-600">{text.intro}</p>
        {state.isPending ? <LoadingBlock /> : state.isError ? <div className="mt-3"><Alert tone="error">{errorMessage(state.error)}</Alert></div> : (
          <div className="mt-3 space-y-3 text-sm">
            <p className="flex flex-wrap items-center gap-2" data-testid={`${id}-state`}>
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
                  <label htmlFor={`${id}-reason`} className="block text-xs font-semibold text-gray-800">Reason (kept in the audit log)</label>
                  <textarea id={`${id}-reason`} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={text.placeholder}
                    aria-invalid={problem ? true : undefined} aria-describedby={problem ? `${id}-reason-error` : undefined} data-testid={`${id}-reason`} />
                  {problem && <p id={`${id}-reason-error`} className="text-xs text-red-700">{problem}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" className={btnPrimary} disabled={change.isPending} data-testid={`${id}-confirm`}>{change.isPending ? "Turning off…" : "Turn off"}</button>
                    <button type="button" className={btnSecondary} onClick={() => { setAsking(false); setProblem(undefined); }}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" className={btnSecondary} onClick={() => setAsking(true)} data-testid={`${id}-revoke`}>{text.turnOff}</button>
              )
            ) : (
              <button type="button" className={btnPrimary} onClick={() => change.mutate(true)} disabled={change.isPending} data-testid={`${id}-restore`}>
                {change.isPending ? "Turning on…" : text.turnOn}
              </button>
            )}
          </div>
        )}
      </section>
    </Card>
  );
}
