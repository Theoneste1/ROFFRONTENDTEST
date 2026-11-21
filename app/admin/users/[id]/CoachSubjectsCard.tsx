"use client";

/**
 * A Coach's subjects (capability coachOlympiadInterests): "Which subjects are you interested in coaching?" — shown on the
 * Coach's account page ("Not set" when none was chosen) and edited by an Administrator (PATCH /admin/users/:id with
 * olympiadInterests, at least one). The backend also requires the right to manage Coach accounts (users.manageCoaches);
 * a refusal is shown here. Information only: subjects never grant marking or any other access.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { usersApi } from "@/lib/api/admin";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { queryKeys } from "@/lib/query/keys";
import { COACH_SUBJECTS_LABEL, COACH_SUBJECTS_REQUIRED, coachSubjectsText } from "@/lib/accounts/coach-application";
import {
  normaliseInterests, otherInterestField, otherInterestSupported, sameInterests, validateInterestsWithOther, type OlympiadSubject,
} from "@/lib/accounts/olympiad-interests";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import OlympiadInterestsField from "@/app/components/account/OlympiadInterestsField";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import { Card, Modal, btnPrimary, btnSecondary } from "../../components/adminUi";

function EditSubjects({ userId, current, currentOther, onDone, onClose }: {
  userId: string; current: readonly string[]; currentOther: string | null; onDone: () => void; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [subjects, setSubjects] = useState<OlympiadSubject[]>(() => normaliseInterests(current));
  // "Other" Olympiad (olympiadInterestOther): null while not ticked.
  const otherOn = otherInterestSupported(useBackendCapabilities().detection);
  const [other, setOther] = useState<string | null>(currentOther);
  const [error, setError] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: (olympiadInterests: OlympiadSubject[]) => usersApi.update(userId, { olympiadInterests, ...otherInterestField(other, currentOther) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.admin.user(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
    },
  });
  const serverFields = fieldErrors(save.error, ["olympiadInterests", "olympiadInterestOther"]);
  const serverField = serverFields.olympiadInterests ?? serverFields.olympiadInterestOther;
  const busy = save.isPending;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateInterestsWithOther(subjects, other, COACH_SUBJECTS_REQUIRED);
    setError(problem);
    if (problem || busy) return;
    if (sameInterests(subjects, current) && (other ?? "").trim() === (currentOther ?? "")) return onClose();
    try {
      await save.mutateAsync(subjects);
      onDone();
    } catch {
      // shown below
    }
  }

  return (
    <Modal title="Edit coaching subjects" onClose={busy ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate data-testid="coach-subjects-edit">
        <OlympiadInterestsField
          value={subjects}
          onChange={(next) => {
            setSubjects(next);
            setError(undefined);
          }}
          error={error ?? serverField}
          label={COACH_SUBJECTS_LABEL}
          hint="Choose one or more. Information only: this gives no course, marking or other access."
          idPrefix="admin-coach-subjects"
          other={other}
          onOtherChange={otherOn ? (next) => {
            setOther(next);
            setError(undefined);
          } : undefined}
        />
        {save.isError && !serverField && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Save subjects
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function CoachSubjectsCard({ userId, subjects, other = null, canEdit }: {
  userId: string; subjects: readonly string[] | null | undefined; other?: string | null; canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <section data-testid="coach-subjects-card">
      <Card className="p-6 h-fit">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-base font-bold text-gray-900">Coaching subjects</h2>
          {canEdit && (
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setDone(false);
                setOpen(true);
              }}
            >
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Edit subjects
            </button>
          )}
        </div>
        {done && (
          <div className="mb-3">
            <Alert tone="success">Coaching subjects saved.</Alert>
          </div>
        )}
        <p className="text-sm text-gray-800" data-testid="coach-subjects">
          {coachSubjectsText(subjects, other)}
        </p>
        <p className="mt-1 text-xs text-gray-600">The subjects this coach is interested in coaching. They give no course, marking or other access.</p>
      </Card>
      {open && (
        <EditSubjects
          userId={userId}
          current={subjects ?? []}
          currentOther={other}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setDone(true);
          }}
        />
      )}
    </section>
  );
}
