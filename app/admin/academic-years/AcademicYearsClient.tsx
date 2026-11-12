"use client";

/**
 * Academic years (academicYears.manage): plan, edit and start a year.
 *
 * Starting a year (`POST /admin/academic-years/:id/activate`) is a one-way,
 * whole-platform change done by the backend in one transaction: the current year
 * is CLOSED and its assignments ARCHIVED, and every active student is rolled
 * over (moved up one grade when "promote" is chosen; S6 students graduate). The
 * page states this plainly and asks for the year's name before doing it.
 * Without a current year, registration and student creation fail.
 *
 * Because that request can outlive the proxy (~26 s) while the backend keeps
 * working (up to 120 s), a lost answer means "outcome unknown": an activation
 * lock (lib/admin/academic-years.ts) then keeps every Start button disabled —
 * across closing the dialog and reloading the page — until the list shows the
 * year started, or the backend's time limit has passed and the year is still
 * planned. The lock is per browser; see the backend note in that file.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Pencil, PlayCircle, Users } from "lucide-react";
import { academicYearsApi, type AcademicYear, type ActivationResult } from "@/lib/api/academic-years";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatNumber } from "@/lib/format";
import {
  ACTIVATION_LOCK_KEY,
  YEAR_ERRORS,
  YEAR_RULES,
  activationLockState,
  activationOutcomeUnknown,
  activationSummary,
  clearActivationLock,
  currentYear,
  dayOf,
  formatDay,
  lockStorage,
  readActivationLock,
  validateYearForm,
  writeActivationLock,
  yearChanges,
  type ActivationLock,
  type YearForm,
} from "@/lib/admin/academic-years";
import { useNow } from "@/lib/hooks/useNow";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { AdminPage, Badge, Modal, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../components/adminUi";

const STATUS_BADGE: Record<AcademicYear["status"], { label: string; cls: string }> = {
  ACTIVE: { label: "Current", cls: "bg-emerald-50 text-emerald-700" },
  PLANNED: { label: "Planned", cls: "bg-indigo-50 text-indigo-700" },
  CLOSED: { label: "Closed", cls: "bg-gray-100 text-gray-600" },
};
const yearError = (e: unknown) => (isApiError(e) && e.code && YEAR_ERRORS[e.code]) || errorMessage(e);

const LOCK_EVENT = "rof:academic-year-lock";

/** The activation lock as React state, kept in step with browser storage (also across tabs). */
function useActivationLock() {
  const subscribe = useCallback((onChange: () => void) => {
    const onStorage = (e: StorageEvent) => e.key === ACTIVATION_LOCK_KEY && onChange();
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCK_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCK_EVENT, onChange);
    };
  }, []);
  const raw = useSyncExternalStore(
    subscribe,
    () => lockStorage().getItem(ACTIVATION_LOCK_KEY),
    () => null,
  );
  const lock = raw ? readActivationLock({ getItem: () => raw, setItem: () => {}, removeItem: () => {} }) : null;
  const set = useCallback((next: ActivationLock | null) => {
    if (next) writeActivationLock(lockStorage(), next);
    else clearActivationLock(lockStorage());
    window.dispatchEvent(new Event(LOCK_EVENT));
  }, []);
  return [lock, set] as const;
}

export default function AcademicYearsClient() {
  const { can, permissionsStatus } = useSession();
  const allowed = permissionsStatus === "ready" && can("academicYears.manage");
  const qc = useQueryClient();
  const [lock, setLock] = useActivationLock();
  const now = useNow(1000);
  const years = useQuery({
    queryKey: queryKeys.academicYears.list(),
    queryFn: academicYearsApi.list,
    enabled: allowed,
    // While a start's outcome is unknown, keep checking whether the year became current.
    refetchInterval: (q) => (activationLockState(lock, q.state.data, q.state.dataUpdatedAt, Date.now()).kind === "waiting" ? 10_000 : false),
  });
  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  const [activating, setActivating] = useState<AcademicYear | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; lines: string[] } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.academicYears.all });

  const list = years.data ?? [];
  const current = currentYear(list);
  const lockState = activationLockState(lock, years.data, years.dataUpdatedAt, now);
  const settled = lockState.kind === "succeeded" || lockState.kind === "expired" ? lockState : null;
  // A settled lock is reported until the administrator dismisses it (which releases it).
  // While settled, starting is allowed again: either the year is current, or the backend's
  // time limit has passed and the year is still planned (a new attempt is safe).
  const settledNotice = settled
    ? settled.kind === "succeeded"
      ? { tone: "success" as const, lines: [`${settled.lock.yearName} is now the current academic year.`, "The detailed counts weren't received; check the enrolments of the new year."] }
      : { tone: "error" as const, lines: [`Starting ${settled.lock.yearName} did not complete: it is still planned. You can try again; check the current year first.`] }
    : null;
  const settledKey = settled ? `${settled.kind}:${settled.lock.startedAt}` : null;
  useEffect(() => {
    if (!settledKey) return;
    // Students, divisions and assignments may have changed.
    void qc.invalidateQueries({ queryKey: queryKeys.admin.all });
    void qc.invalidateQueries({ queryKey: queryKeys.assignments.all });
  }, [settledKey, qc]);
  const startLocked = lockState.kind === "waiting";

  if (permissionsStatus === "ready" && !allowed) {
    return (
      <AdminPage title="Academic years">
        <Notice tone="info">Managing academic years needs the academicYears.manage permission.</Notice>
      </AdminPage>
    );
  }


  return (
    <AdminPage
      title="Academic years"
      description="Each student is enrolled in the current academic year. Plan the next year here and start it when the school year begins."
      actions={
        <button type="button" className={btnPrimary} onClick={() => setEditing("new")} disabled={!years.isSuccess}>
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> Plan a year
        </button>
      }
    >
      {settledNotice && (
        <div data-testid="activation-outcome">
          <Notice tone={settledNotice.tone} onClose={() => setLock(null)}>
            {settledNotice.lines.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </Notice>
        </div>
      )}
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </Notice>
      )}

      {years.isPending ? (
        <LoadingBlock />
      ) : years.isError ? (
        <ErrorState error={years.error} title="Couldn't load the academic years" onRetry={() => years.refetch()} />
      ) : (
        <>
          {lockState.kind === "waiting" && (
            <div className="mb-4" data-testid="activation-lock">
              <Alert tone="error">
                Starting <strong>{lockState.lock.yearName}</strong> was requested at {new Date(lockState.lock.startedAt).toLocaleTimeString()}, but no answer was received. The server may still be
                working on it, so no year can be started until {new Date(lockState.until).toLocaleTimeString()} (about {Math.max(1, Math.ceil((lockState.until - now) / 1000))} s). This list checks
                every 10 seconds and will show the result. Don&apos;t start a year from another browser or device in the meantime.
              </Alert>
            </div>
          )}
          {current ? (
            <p className="mb-4 text-sm text-gray-600" data-testid="current-year">
              Current year: <strong className="text-gray-900">{current.name}</strong> ({formatDay(current.startsOn)} – {formatDay(current.endsOn)})
            </p>
          ) : (
            <div className="mb-4" data-testid="no-current-year">
              <Alert tone="error">
                No academic year is active. Student registration and creating student accounts fail until a year is started. Plan a year (if needed) and start it.
              </Alert>
            </div>
          )}

          <TableCard>
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className={th}>Year</th>
                <th className={th}>Dates</th>
                <th className={th}>Status</th>
                <th className={th}>Enrolments</th>
                <th className={th}>Assignments</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50" data-testid="years">
              {list.length === 0 ? (
                <TableMessage colSpan={6}>No academic years yet. Plan the first one.</TableMessage>
              ) : (
                list.map((y) => (
                  <tr key={y.id}>
                    <td className={`${td} font-semibold text-gray-800`}>{y.name}</td>
                    <td className={`${td} text-gray-600 whitespace-nowrap`}>
                      {formatDay(y.startsOn)} – {formatDay(y.endsOn)}
                    </td>
                    <td className={td}>
                      <Badge className={STATUS_BADGE[y.status].cls}>{STATUS_BADGE[y.status].label}</Badge>
                    </td>
                    <td className={`${td} text-gray-600`}>{y._count ? formatNumber(y._count.enrollments) : "—"}</td>
                    <td className={`${td} text-gray-600`}>{y._count ? formatNumber(y._count.assignments) : "—"}</td>
                    <td className={`${td} text-right whitespace-nowrap space-x-3`}>
                      <Link href={`/admin/academic-years/${y.id}`} className={linkBtn} aria-label={`Enrolments of ${y.name}`}>
                        <Users className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        Enrolments
                      </Link>
                      {y.status !== "CLOSED" && (
                        <button type="button" className={linkBtn} onClick={() => setEditing(y)} aria-label={`Edit ${y.name}`}>
                          <Pencil className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
                          Edit
                        </button>
                      )}
                      {y.status === "PLANNED" && (
                        <button
                          type="button"
                          className={`${linkBtn} disabled:opacity-40 disabled:cursor-not-allowed`}
                          onClick={() => setActivating(y)}
                          disabled={startLocked}
                          title={startLocked ? "Locked while an earlier start's outcome is unknown" : undefined}
                          aria-label={`Start ${y.name}`}
                        >
                          <PlayCircle className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />
                          Start year
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </TableCard>
        </>
      )}

      {editing && (
        <YearFormDialog
          year={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(y, created) => {
            setEditing(null);
            setNotice({ tone: "success", lines: [created ? `${y.name} planned. Start it when the school year begins.` : `${y.name} saved.`] });
            void refresh();
          }}
          onStale={() => void refresh()}
        />
      )}
      {activating && (
        <ActivateDialog
          year={activating}
          current={current}
          locked={startLocked}
          onLock={setLock}
          onClose={() => setActivating(null)}
          onDone={(r) => {
            setLock(null);
            setActivating(null);
            setNotice({ tone: "success", lines: activationSummary(r) });
            void refresh();
            // Students, divisions and assignments all changed.
            void qc.invalidateQueries({ queryKey: queryKeys.admin.all });
            void qc.invalidateQueries({ queryKey: queryKeys.assignments.all });
          }}
          onStale={() => void refresh()}
        />
      )}
    </AdminPage>
  );
}

function YearFormDialog({ year, onClose, onSaved, onStale }: { year: AcademicYear | null; onClose: () => void; onSaved: (y: AcademicYear, created: boolean) => void; onStale: () => void }) {
  const [f, setF] = useState<YearForm>({ name: year?.name ?? "", startsOn: year ? dayOf(year.startsOn) : "", endsOn: year ? dayOf(year.endsOn) : "" });
  const [errors, setErrors] = useState<Partial<Record<keyof YearForm, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const save = useMutation({
    onSettled: () => {
      inFlight.current = false;
    },
    mutationFn: () => (year ? academicYearsApi.update(year.id, yearChanges(year, f)) : academicYearsApi.create({ name: f.name.trim(), startsOn: f.startsOn, endsOn: f.endsOn })),
    onSuccess: (y) => onSaved(y, !year),
    onError: (e) => {
      const fe = fieldErrors(e, ["name", "startsOn", "endsOn"]);
      if (isApiError(e) && e.code === "INVALID_DATE_RANGE") fe.endsOn = YEAR_ERRORS.INVALID_DATE_RANGE;
      if (isApiError(e) && e.code === "DUPLICATE") fe.name = YEAR_ERRORS.DUPLICATE;
      if (isApiError(e) && e.code === "INVALID_STATE_TRANSITION") onStale();
      setErrors(fe);
      setFormError(Object.keys(fe).length ? null : yearError(e));
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const v = validateYearForm(f);
    setErrors(v);
    setFormError(null);
    if (Object.keys(v).length) return;
    if (year && Object.keys(yearChanges(year, f)).length === 0) return setFormError("Nothing has changed.");
    inFlight.current = true;
    save.mutate();
  }

  const input = "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
  const field = (key: keyof YearForm, label: string, type: string, extra: Record<string, unknown> = {}) => (
    <div>
      <label htmlFor={`year-${key}`} className="block text-xs font-semibold text-gray-600 mb-1">
        {label} <span className="text-red-500">*</span>
      </label>
      <input
        id={`year-${key}`}
        type={type}
        value={f[key]}
        onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `year-${key}-error` : undefined}
        className={`${input} ${errors[key] ? "border-red-400" : "border-gray-200"}`}
        {...extra}
      />
      {errors[key] && (
        <p id={`year-${key}-error`} className="mt-1 text-[11px] text-red-600">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <Modal title={year ? `Edit ${year.name}` : "Plan an academic year"} onClose={() => !inFlight.current && onClose()}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="year-form">
        {field("name", "Name", "text", { maxLength: YEAR_RULES.nameMax, placeholder: "2027-2028" })}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field("startsOn", "First day", "date")}
          {field("endsOn", "Last day", "date")}
        </div>
        {!year && <p className="text-[11px] text-gray-500">A new year is planned; nothing changes for students until you start it.</p>}
        {formError && <Alert tone={formError === "Nothing has changed." ? "info" : "error"}>{formError}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={save.isPending}>
            {save.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            {year ? "Save" : "Plan year"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActivateDialog({
  year,
  current,
  locked,
  onLock,
  onClose,
  onDone,
  onStale,
}: {
  year: AcademicYear;
  current: AcademicYear | null;
  locked: boolean;
  onLock: (lock: ActivationLock | null) => void;
  onClose: () => void;
  onDone: (r: ActivationResult) => void;
  onStale: () => void;
}) {
  const [promote, setPromote] = useState<"" | "yes" | "no">("");
  const [typed, setTyped] = useState("");
  const [unknown, setUnknown] = useState(false);
  const inFlight = useRef(false);
  const activate = useMutation({
    onSettled: () => {
      inFlight.current = false;
    },
    // Graduates are always deactivated: with deactivateGraduates=false the backend would
    // re-enrol them as S6 students in the new year (its "students without an enrolment" step).
    mutationFn: () => academicYearsApi.activate(year.id, { promoteStudents: promote === "yes", ...(promote === "yes" && { deactivateGraduates: true }) }),
    onMutate: () => onLock({ yearId: year.id, yearName: year.name, startedAt: Date.now() }),
    onSuccess: onDone,
    onError: (e) => {
      if (activationOutcomeUnknown(e)) {
        // Keep the lock: the backend may still be starting the year.
        setUnknown(true);
        onStale();
        return;
      }
      onLock(null);
      if (isApiError(e) && (e.code === "INVALID_STATE_TRANSITION" || e.status === 404)) onStale();
    },
  });
  const ready = promote !== "" && typed.trim() === year.name && !activate.isPending && !locked && !unknown;

  return (
    <Modal wide title={`Start ${year.name}`} onClose={() => !inFlight.current && onClose()}>
      <div className="space-y-4" data-testid="activate-dialog">
        <Alert tone="error">This changes the whole platform at once and can&apos;t be undone here.</Alert>
        <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>
            <strong>{year.name}</strong> becomes the current academic year.
          </li>
          {current ? (
            <li>
              <strong>{current.name}</strong> is closed and all of its assignments are archived (reviews already started can still be finished and published).
            </li>
          ) : (
            <li>There is no current year to close.</li>
          )}
          <li>
            Students with an active enrolment{current ? ` in ${current.name}` : ""} and an active account move into {year.name} (moved up a grade or kept, as chosen below).
          </li>
          <li>Suspended students are not moved into {year.name}.</li>
          <li>Active students with no enrolment are enrolled at the grade on their profile; they are not moved up.</li>
        </ul>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-gray-700 mb-1">
            Students&apos; grades <span className="text-red-500">*</span>
          </legend>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="radio" name="promote" checked={promote === "yes"} onChange={() => setPromote("yes")} className="mt-1" />
            <span>
              <strong>Move every student up one grade</strong> — the start of a new school year (S3 students move to the Senior division).
            </span>
          </label>
          {promote === "yes" && (
            <p className="ml-6 text-xs text-gray-600" data-testid="graduates-note">
              S6 students graduate: their enrolment ends and their accounts are deactivated, so they can no longer sign in. Their work and results are kept. This can&apos;t be switched off here —
              the server would otherwise enrol graduates again as S6 students in {year.name}. Reactivate a graduate&apos;s account individually afterwards if needed.
            </p>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="radio" name="promote" checked={promote === "no"} onChange={() => setPromote("no")} className="mt-1" />
            <span>
              <strong>Keep every student in the same grade</strong>
            </span>
          </label>
        </fieldset>

        <div>
          <label htmlFor="confirm-year" className="block text-xs font-semibold text-gray-700 mb-1">
            Type <strong>{year.name}</strong> to confirm
          </label>
          <input
            id="confirm-year"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {unknown ? (
          <Alert tone="error">
            No answer was received ({errorMessage(activate.error)}). The server may still be starting {year.name}. Starting is locked for a few minutes while the list checks the result —
            you can close this dialog; the lock stays.
          </Alert>
        ) : (
          activate.isError && <Alert tone="error">{yearError(activate.error)}</Alert>
        )}
        {locked && !activate.isPending && !unknown && <Alert tone="info">An earlier start&apos;s outcome is still unknown. Starting is locked until the list shows the result.</Alert>}
        {activate.isPending && <p className="text-xs text-gray-500">Starting the year… this can take a minute or two with many students. Keep this page open; this dialog can&apos;t be closed meanwhile.</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={activate.isPending}>
            {unknown ? "Close" : "Cancel"}
          </button>
          <button type="button" className={btnPrimary} disabled={!ready} onClick={() => {
              if (inFlight.current) return;
              inFlight.current = true;
              activate.mutate();
            }}
          >
            {activate.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Start {year.name}
          </button>
        </div>
      </div>
    </Modal>
  );
}
