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
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Pencil, PlayCircle, Users } from "lucide-react";
import { academicYearsApi, type AcademicYear, type ActivationResult } from "@/lib/api/academic-years";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { formatNumber } from "@/lib/format";
import { YEAR_ERRORS, YEAR_RULES, activationSummary, currentYear, dayOf, formatDay, validateYearForm, yearChanges, type YearForm } from "@/lib/admin/academic-years";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { AdminPage, Badge, Modal, Notice, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../components/adminUi";

const STATUS_BADGE: Record<AcademicYear["status"], { label: string; cls: string }> = {
  ACTIVE: { label: "Current", cls: "bg-emerald-50 text-emerald-700" },
  PLANNED: { label: "Planned", cls: "bg-indigo-50 text-indigo-700" },
  CLOSED: { label: "Closed", cls: "bg-gray-100 text-gray-600" },
};
const yearError = (e: unknown) => (isApiError(e) && e.code && YEAR_ERRORS[e.code]) || errorMessage(e);

export default function AcademicYearsClient() {
  const { can, permissionsStatus } = useSession();
  const allowed = permissionsStatus === "ready" && can("academicYears.manage");
  const qc = useQueryClient();
  const years = useQuery({ queryKey: queryKeys.academicYears.list(), queryFn: academicYearsApi.list, enabled: allowed });
  const [editing, setEditing] = useState<AcademicYear | "new" | null>(null);
  const [activating, setActivating] = useState<AcademicYear | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; lines: string[] } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.academicYears.all });

  if (permissionsStatus === "ready" && !allowed) {
    return (
      <AdminPage title="Academic years">
        <Notice tone="info">Managing academic years needs the academicYears.manage permission.</Notice>
      </AdminPage>
    );
  }

  const list = years.data ?? [];
  const current = currentYear(list);

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
                        <button type="button" className={linkBtn} onClick={() => setActivating(y)} aria-label={`Start ${y.name}`}>
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
          onClose={() => setActivating(null)}
          onDone={(r) => {
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
  const save = useMutation({
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
    <Modal title={year ? `Edit ${year.name}` : "Plan an academic year"} onClose={onClose}>
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

function ActivateDialog({ year, current, onClose, onDone, onStale }: { year: AcademicYear; current: AcademicYear | null; onClose: () => void; onDone: (r: ActivationResult) => void; onStale: () => void }) {
  const [promote, setPromote] = useState<"" | "yes" | "no">("");
  const [deactivateGraduates, setDeactivateGraduates] = useState(true);
  const [typed, setTyped] = useState("");
  const activate = useMutation({
    mutationFn: () => academicYearsApi.activate(year.id, { promoteStudents: promote === "yes", ...(promote === "yes" && { deactivateGraduates }) }),
    onSuccess: onDone,
    onError: (e) => {
      if (isApiError(e) && e.code === "INVALID_STATE_TRANSITION") onStale();
    },
  });
  const ready = promote !== "" && typed.trim() === year.name && !activate.isPending;

  return (
    <Modal wide title={`Start ${year.name}`} onClose={onClose}>
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
          <li>Every active student is enrolled in {year.name}; students without an enrolment are enrolled at their current grade.</li>
        </ul>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-gray-700 mb-1">
            Students&apos; grades <span className="text-red-500">*</span>
          </legend>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="radio" name="promote" checked={promote === "yes"} onChange={() => setPromote("yes")} className="mt-1" />
            <span>
              <strong>Move every student up one grade</strong> — the start of a new school year (S3 students move to the Senior division; S6 students graduate).
            </span>
          </label>
          {promote === "yes" && (
            <label className="ml-6 flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={deactivateGraduates} onChange={(e) => setDeactivateGraduates(e.target.checked)} className="mt-1" />
              <span>Deactivate the accounts of graduating S6 students</span>
            </label>
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

        {activate.isError && <Alert tone="error">{yearError(activate.error)}</Alert>}
        {activate.isPending && <p className="text-xs text-gray-500">Starting the year… this can take a minute with many students. Keep this page open.</p>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={activate.isPending}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={!ready} onClick={() => activate.mutate()}>
            {activate.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Start {year.name}
          </button>
        </div>
      </div>
    </Modal>
  );
}
