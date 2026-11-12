"use client";

/**
 * Deactivate or reactivate a school (`PATCH /admin/schools/:id/active`, reason required).
 * Before confirming, the administrator sees what refers to the school (GET /admin/schools/:id →
 * counts) and what the change means; none of those records is changed.
 */
import { useRef, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { adminSchoolsApi, type DirectorySchoolRecord, type SetActiveResult } from "@/lib/api/school-directory";
import { errorMessage } from "@/lib/api/errors";
import { ACTIVE_REASON, activeChangeExplanation, activeReasonProblem, impactLines } from "@/lib/admin/school-directory";
import { useDirectorySchool } from "@/lib/queries/school-directory";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import { Modal, btnDanger, btnPrimary, btnSecondary } from "../../components/adminUi";

export default function SchoolActiveDialog({
  school,
  onClose,
  onDone,
}: {
  school: DirectorySchoolRecord;
  onClose: () => void;
  onDone: (result: SetActiveResult) => void;
}) {
  const deactivate = school.isActive;
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const detail = useDirectorySchool(school.id);
  const change = useMutation({
    mutationFn: () => adminSchoolsApi.setActive(school.id, { isActive: !deactivate, reason: reason.trim() }),
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: onDone,
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (change.isPending) return;
    const p = activeReasonProblem(reason);
    setReasonError(p);
    if (p) return;
    inFlight.current = true;
    change.mutate();
  }

  return (
    <Modal wide title={`${deactivate ? "Deactivate" : "Reactivate"} ${school.name}`} onClose={() => !inFlight.current && onClose()}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="school-active-form">
        <p className="text-sm text-gray-600">{activeChangeExplanation(deactivate)}</p>
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3" data-testid="school-impact">
          <p className="text-xs font-semibold text-gray-600 mb-1">What refers to this school (kept as it is)</p>
          {detail.isPending ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : detail.isError ? (
            <p className="text-xs text-red-600">Couldn&apos;t load the current counts: {errorMessage(detail.error)}</p>
          ) : (
            <ul className="list-disc pl-5 text-xs text-gray-700 space-y-0.5">
              {impactLines(detail.data.counts).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="school-active-reason" className="block text-xs font-semibold text-gray-600 mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="school-active-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={ACTIVE_REASON.max}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby="school-active-reason-note"
            className={`w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${reasonError ? "border-red-400" : "border-gray-200"}`}
          />
          <p id="school-active-reason-note" className={`mt-1 text-[11px] ${reasonError ? "text-red-600" : "text-gray-500"}`}>
            {reasonError ?? `${ACTIVE_REASON.min}–${ACTIVE_REASON.max} characters, recorded in the audit log.`}
          </p>
        </div>
        {change.isError && <Alert tone="error">{errorMessage(change.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={change.isPending}>
            Cancel
          </button>
          <button type="submit" className={deactivate ? btnDanger : btnPrimary} disabled={change.isPending}>
            {change.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            {deactivate ? "Deactivate school" : "Reactivate school"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
