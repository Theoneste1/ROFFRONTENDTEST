"use client";

/**
 * Date of birth of a STUDENT account (capability dateOfBirthCorrection, users.manage): "Correct date of birth" with a
 * mandatory reason (PUT /admin/users/:id/date-of-birth) and the date-of-birth history (GET …/date-of-birth-history).
 */
import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { usersApi } from "@/lib/api/admin";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/auth/roles";
import { queryKeys } from "@/lib/query/keys";
import {
  birthDateBounds,
  CORRECTION_ERRORS,
  correctionBody,
  DOB_REASON,
  historyActor,
  historyLine,
  validateCorrection,
} from "@/lib/accounts/date-of-birth-correction";
import { Alert, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { Card, Modal, btnPrimary, btnSecondary } from "../../components/adminUi";

const historyKey = (userId: string) => [...queryKeys.admin.user(userId), "date-of-birth-history"] as const;

function CorrectDateOfBirthForm({ userId, current, onDone, onClose }: { userId: string; current: string | null | undefined; onDone: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [dateOfBirth, setDateOfBirth] = useState(current ? current.slice(0, 10) : "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ dateOfBirth?: string; reason?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const dateId = useId();
  const reasonId = useId();
  const bounds = birthDateBounds(new Date());

  const save = useMutation({
    mutationFn: (body: { dateOfBirth: string; reason: string }) => usersApi.correctDateOfBirth(userId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.admin.user(userId) });
      void qc.invalidateQueries({ queryKey: queryKeys.admin.usersAll });
    },
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const draft = { dateOfBirth, reason };
    const problems = validateCorrection(draft);
    setErrors(problems);
    setServerError(null);
    if (problems.dateOfBirth || problems.reason) return;
    try {
      await save.mutateAsync(correctionBody(draft));
      onDone();
    } catch (err) {
      setServerError(isApiError(err) && CORRECTION_ERRORS[err.code] ? CORRECTION_ERRORS[err.code] : errorMessage(err));
    }
  }

  const busy = save.isPending;
  return (
    <Modal title="Correct date of birth" onClose={busy ? () => undefined : onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-gray-600">
          The correction is recorded in the account&apos;s date-of-birth history with the old and new dates, your reason and your name.
        </p>
        <div>
          <label htmlFor={dateId} className="block text-xs font-semibold text-gray-600 mb-1">
            Date of birth <span className="text-red-500">*</span>
          </label>
          <input
            id={dateId}
            type="date"
            value={dateOfBirth}
            min={bounds.min}
            max={bounds.max}
            onChange={(e) => setDateOfBirth(e.target.value)}
            aria-invalid={!!errors.dateOfBirth}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.dateOfBirth && <p className="mt-1 text-xs text-red-600">{errors.dateOfBirth}</p>}
        </div>
        <div>
          <label htmlFor={reasonId} className="block text-xs font-semibold text-gray-600 mb-1">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={DOB_REASON.max}
            placeholder="For example: the birth certificate shows another date."
            aria-invalid={!!errors.reason}
            className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
        </div>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="px-5 py-2 text-sm text-gray-600 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Save correction
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function DateOfBirthCard({ userId, dateOfBirth }: { userId: string; dateOfBirth: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const qc = useQueryClient();
  const history = useQuery({
    queryKey: historyKey(userId),
    queryFn: () => usersApi.dateOfBirthHistory(userId),
  });

  return (
    <section className="lg:col-span-2" data-testid="date-of-birth-card">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <h2 className="text-base font-bold text-gray-900">Date of birth history</h2>
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              setDone(false);
              setOpen(true);
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /> Correct date of birth
          </button>
        </div>
        {done && (
          <div className="mb-3">
            <Alert tone="success">Date of birth corrected.</Alert>
          </div>
        )}
        {history.isPending && <LoadingBlock />}
        {history.isError && <Alert tone="error">{errorMessage(history.error)}</Alert>}
        {history.data &&
          (history.data.length === 0 ? (
            <p className="text-sm text-gray-600">No date-of-birth changes were recorded for this account.</p>
          ) : (
            <ol className="space-y-3 border-l border-gray-200 pl-4">
              {history.data.map((e, i) => {
                const line = historyLine(e);
                return (
                  <li key={`${e.at}-${i}`} className="text-sm">
                    <p className="font-medium text-gray-900">{line.title}</p>
                    <p className="text-xs text-gray-600">
                      {formatDateTime(e.at)} · {historyActor(e, (r) => roleLabel(r as never))}
                    </p>
                    {line.change && <p className="text-xs text-gray-800 mt-0.5">{line.change}</p>}
                    {line.reason && <p className="text-xs text-gray-700 mt-0.5 break-words">Reason: {line.reason}</p>}
                  </li>
                );
              })}
            </ol>
          ))}
      </Card>
      {open && (
        <CorrectDateOfBirthForm
          userId={userId}
          current={dateOfBirth}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setDone(true);
            void qc.invalidateQueries({ queryKey: historyKey(userId) });
          }}
        />
      )}
    </section>
  );
}
