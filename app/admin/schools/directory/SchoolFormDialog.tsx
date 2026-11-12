"use client";

/**
 * Create or edit a school (`POST /admin/schools`, `PATCH /admin/schools/:id`).
 * - Rwanda: province → district → sector from the official list (GET /schools/locations), an
 *   optional 6-digit code whose first digit is the province, optional cell and village.
 * - Another country: a two-letter country code and a location; never a code or a Rwandan place.
 * - Editing sends only what changed; a reason is required to set or change a code, or to change
 *   the name, country or place of an official-directory school (the backend's REASON_REQUIRED).
 * - 409 POSSIBLE_DUPLICATE lists the schools with the same name nearby; the administrator may go
 *   back or save anyway (confirmPossibleDuplicate, recorded in the audit log).
 * - 409 SCHOOL_CODE_TAKEN points to the school that has the code.
 */
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { adminSchoolsApi, type DirectorySchoolRecord, type DuplicateCandidate } from "@/lib/api/school-directory";
import {
  ACCOMMODATION_LABEL,
  ACCOMMODATION_OPTIONS,
  OWNERSHIP_LABEL,
  OWNERSHIP_OPTIONS,
  PROVINCE_BY_CODE_PREFIX,
  RWANDA,
  createPayload,
  emptySchoolForm,
  formFromSchool,
  interpretSaveError,
  provinceOfCode,
  reasonRequired,
  updatePayload,
  validateSchoolForm,
  withReason,
  type SchoolForm,
  type SchoolFormErrors,
  type SchoolFormField,
} from "@/lib/admin/school-directory";
import { useSchoolLocations } from "@/lib/queries/school-directory";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import { Badge, Modal, btnPrimary, btnSecondary, linkBtn } from "../../components/adminUi";

const input =
  "w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500";

export default function SchoolFormDialog({
  school,
  onClose,
  onSaved,
}: {
  /** null: create a school. */
  school: DirectorySchoolRecord | null;
  onClose: () => void;
  onSaved: (saved: DirectorySchoolRecord, created: boolean) => void;
}) {
  const [f, setF] = useState<SchoolForm>(() => (school ? formFromSchool(school) : emptySchoolForm()));
  const [errors, setErrors] = useState<SchoolFormErrors>({});
  const [formError, setFormError] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [codeTakenBy, setCodeTakenBy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const locations = useSchoolLocations();
  const rwanda = f.countryCode.trim().toUpperCase() === RWANDA;
  const countryLocked = !!school?.code; // a school with a code stays in Rwanda (a code cannot be removed)
  const payload = school ? updatePayload(school, f) : null;
  const needsReason = !!school && !!payload && reasonRequired(school, payload);

  const save = useMutation({
    mutationFn: (confirm: boolean) =>
      school ? adminSchoolsApi.update(school.id, withReason(updatePayload(school, f), f.reason, confirm)) : adminSchoolsApi.create(createPayload(f, confirm)),
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: (saved) => onSaved(saved, !school),
    onError: (e) => {
      const p = interpretSaveError(e);
      setErrors(p.fieldErrors);
      setCodeTakenBy(p.codeTakenBy);
      setDuplicates(p.duplicates);
      setFormError(p.formError ? { tone: p.noChanges ? "info" : "error", text: p.formError } : null);
    },
  });

  function send(confirm: boolean) {
    if (save.isPending) return;
    inFlight.current = true;
    save.mutate(confirm);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return;
    const v = validateSchoolForm(f, school);
    setErrors(v);
    setFormError(null);
    setCodeTakenBy(null);
    if (Object.keys(v).length) return;
    if (school && payload && Object.keys(payload).length === 0) return setFormError({ tone: "info", text: "Nothing has changed." });
    send(false);
  }

  const set = <K extends SchoolFormField>(k: K, v: SchoolForm[K]) => setF((s) => ({ ...s, [k]: v }));

  // Province → district → sector from the official list, keeping a stored value that is not in it.
  const provinces = useMemo(() => locations.data ?? [], [locations.data]);
  const districts = provinces.find((p) => p.province === f.province)?.districts ?? [];
  const sectors = districts.find((d) => d.district === f.district)?.sectors ?? [];
  const withCurrent = (list: string[], current: string) => (current && !list.includes(current) ? [current, ...list] : list);
  const codeProvince = f.code.trim() ? provinceOfCode(f.code.trim()) : null;

  if (duplicates) {
    return (
      <Modal wide title="Schools with the same name nearby" onClose={() => !inFlight.current && onClose()}>
        <div className="space-y-4" data-testid="duplicate-review">
          <p className="text-sm text-gray-600">
            {duplicates.length === 1 ? "A school" : `${duplicates.length} schools`} with the same name already {duplicates.length === 1 ? "exists" : "exist"}{" "}
            {rwanda ? "in this district" : "in this country"}. Use the existing school if it is the same one. Save anyway only if this is a different school; your
            confirmation is recorded.
          </p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {duplicates.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-gray-800">{c.name}</span>
                  <span className="block text-xs text-gray-500">
                    {[c.code && `Code ${c.code}`, c.district, c.countryCode].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {!c.isActive && <Badge className="bg-gray-100 text-gray-500">Inactive</Badge>}
                  <Link href={`/admin/schools/${c.id}`} target="_blank" rel="noopener" className={linkBtn}>
                    Open
                  </Link>
                </span>
              </li>
            ))}
          </ul>
          {formError && <Alert tone={formError.tone}>{formError.text}</Alert>}
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" className={btnSecondary} onClick={() => setDuplicates(null)} disabled={save.isPending}>
              Back to the form
            </button>
            <button type="button" className={btnPrimary} onClick={() => send(true)} disabled={save.isPending}>
              {save.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
              {school ? "Save anyway" : "Create anyway"}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal wide title={school ? `Edit ${school.name}` : "Add a school"} onClose={() => !inFlight.current && onClose()}>
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="school-form">
        <Field id="name" label="Name" required error={errors.name}>
          {(p) => <input {...p} value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={200} className={cls(input, errors.name)} />}
        </Field>

        <fieldset>
          <legend className="block text-xs font-semibold text-gray-600 mb-1">
            Country <span className="text-red-500">*</span>
          </legend>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="country" checked={rwanda} disabled={countryLocked} onChange={() => set("countryCode", RWANDA)} /> Rwanda
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="country"
                checked={!rwanda}
                disabled={countryLocked}
                onChange={() => set("countryCode", school && school.countryCode !== RWANDA ? school.countryCode : "")}
              />{" "}
              Another country
            </label>
            {!rwanda && (
              <input
                aria-label="Country code"
                value={f.countryCode}
                onChange={(e) => set("countryCode", e.target.value.toUpperCase().slice(0, 2))}
                placeholder="KE"
                maxLength={2}
                className={`${cls(input, errors.countryCode)} !w-20 uppercase`}
                aria-invalid={errors.countryCode ? true : undefined}
              />
            )}
          </div>
          {countryLocked && <p className="mt-1 text-[11px] text-gray-500">A school with an official code stays in Rwanda.</p>}
          {errors.countryCode && <p className="mt-1 text-[11px] text-red-600">{errors.countryCode}</p>}
        </fieldset>

        {rwanda ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field id="province" label="Province" required error={errors.province}>
                {(p) => (
                  <select {...p} value={f.province} onChange={(e) => setF((s) => ({ ...s, province: e.target.value, district: "", sector: "" }))} className={cls(input, errors.province)}>
                    <option value="">{locations.isPending ? "Loading…" : "Choose…"}</option>
                    {withCurrent(provinces.map((x) => x.province), f.province).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id="district" label="District" required error={errors.district}>
                {(p) => (
                  <select {...p} value={f.district} disabled={!f.province} onChange={(e) => setF((s) => ({ ...s, district: e.target.value, sector: "" }))} className={cls(input, errors.district)}>
                    <option value="">Choose…</option>
                    {withCurrent(districts.map((x) => x.district), f.district).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id="sector" label="Sector" required error={errors.sector}>
                {(p) => (
                  <select {...p} value={f.sector} disabled={!f.district} onChange={(e) => set("sector", e.target.value)} className={cls(input, errors.sector)}>
                    <option value="">Choose…</option>
                    {withCurrent(sectors, f.sector).map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            {locations.isError && <Alert tone="error">Couldn&apos;t load the official province, district and sector list. Close and try again.</Alert>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                id="code"
                label="Official code"
                error={errors.code}
                hint={
                  codeProvince
                    ? `${f.code.trim()} is a ${codeProvince} code.`
                    : `Optional. 6 digits; the first is the province (${Object.entries(PROVINCE_BY_CODE_PREFIX)
                        .map(([d, p]) => `${d} ${p.replace(" Province", "")}`)
                        .join(", ")}).`
                }
              >
                {(p) => <input {...p} inputMode="numeric" value={f.code} onChange={(e) => set("code", e.target.value.replace(/\D/g, "").slice(0, 6))} className={cls(input, errors.code)} />}
              </Field>
              <Field id="cell" label="Cell" error={errors.cell} hint="Optional.">
                {(p) => <input {...p} value={f.cell} onChange={(e) => set("cell", e.target.value)} maxLength={100} className={cls(input, errors.cell)} />}
              </Field>
              <Field id="village" label="Village" error={errors.village} hint="Optional.">
                {(p) => <input {...p} value={f.village} onChange={(e) => set("village", e.target.value)} maxLength={100} className={cls(input, errors.village)} />}
              </Field>
            </div>
            {codeTakenBy && (
              <p className="text-xs text-red-600">
                <Link href={`/admin/schools/${codeTakenBy}`} target="_blank" rel="noopener" className="underline">
                  View the school that has this code
                </Link>
              </p>
            )}
            <Field id="location" label="Location" error={errors.location} hint={`Optional. Shown with the school; ${school ? "kept as it is" : "defaults to “Sector, District”"} when left empty.`}>
              {(p) => <input {...p} value={f.location} onChange={(e) => set("location", e.target.value)} maxLength={200} className={cls(input, errors.location)} />}
            </Field>
          </>
        ) : (
          <Field id="location" label="Location" required error={errors.location} hint="The town or city, e.g. Nairobi.">
            {(p) => <input {...p} value={f.location} onChange={(e) => set("location", e.target.value)} maxLength={200} className={cls(input, errors.location)} />}
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="ownership" label="Ownership" error={errors.ownership} hint={school?.ownership ? undefined : "Optional."}>
            {(p) => (
              <select {...p} value={f.ownership} onChange={(e) => set("ownership", e.target.value as SchoolForm["ownership"])} className={cls(input, errors.ownership)}>
                {!school?.ownership && <option value="">Not recorded</option>}
                {OWNERSHIP_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {OWNERSHIP_LABEL[o]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="accommodation" label="Accommodation" error={errors.accommodation} hint="Optional.">
            {(p) => (
              <select {...p} value={f.accommodation} onChange={(e) => set("accommodation", e.target.value as SchoolForm["accommodation"])} className={cls(input, errors.accommodation)}>
                <option value="">Not recorded</option>
                {ACCOMMODATION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {ACCOMMODATION_LABEL[o]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {school && (
          <Field
            id="reason"
            label="Reason"
            required={needsReason}
            error={errors.reason}
            hint={
              needsReason
                ? "Required: this changes the code, or the name, country or place of an official-directory school. Recorded in the audit log."
                : "Optional. Recorded in the audit log."
            }
          >
            {(p) => <textarea {...p} rows={2} value={f.reason} onChange={(e) => set("reason", e.target.value)} maxLength={500} className={cls(input, errors.reason)} />}
          </Field>
        )}

        {!school && <p className="text-[11px] text-gray-500">The school is created active. Students, invitations and CSV imports can then refer to it.</p>}
        {formError && <Alert tone={formError.tone}>{formError.text}</Alert>}
        <div className="flex justify-end gap-3">
          <button type="button" className={btnSecondary} onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button type="submit" className={btnPrimary} disabled={save.isPending}>
            {save.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
            {school ? "Save" : "Add school"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const cls = (base: string, error?: string) => `${base} ${error ? "border-red-400" : "border-gray-200"}`;

/** A labelled control with its hint or error, wired for screen readers. */
function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string; "aria-required"?: true }) => ReactNode;
}) {
  const uid = useId();
  const controlId = `school-${id}-${uid}`;
  const noteId = `${controlId}-note`;
  return (
    <div>
      <label htmlFor={controlId} className="block text-xs font-semibold text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children({
        id: controlId,
        ...(error && { "aria-invalid": true as const }),
        ...((error || hint) && { "aria-describedby": noteId }),
        ...(required && { "aria-required": true as const }),
      })}
      {error ? (
        <p id={noteId} className="mt-1 text-[11px] text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="mt-1 text-[11px] text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
