"use client";

/**
 * Shared building blocks of the standard school selection (lib/schools/school-cascade.ts):
 *
 *   Country → Province → District → Sector → School
 *
 * Plain dropdowns only (no search box): each one lists the options of the step before it, from
 * the official directory, and is disabled until that step is chosen. Used by student registration,
 * the student's profile, teacher registration, the teacher-application review, and every
 * administrator form that names a school (SchoolPicker).
 * `variant` keeps each page's existing look: "public" (sign-up / profile), "admin" (admin pages).
 */
import { useId, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { schoolDirectoryApi, type DirectorySchool } from "@/lib/api/accounts";
import { errorMessage } from "@/lib/api/errors";
import { countryOptions } from "@/lib/schools/countries";
import { byName, districtsOf, NOT_LISTED, placeComplete, provincesOf, schoolFacts, sectorsOf, setPlaceLevel, type Place, type PlaceLevel } from "@/lib/schools/school-cascade";
import { useSchoolLocations } from "@/lib/queries/school-directory";

export type CascadeVariant = "public" | "admin";

const STYLES: Record<CascadeVariant, { label: string; select: (bad: boolean) => string; error: string; hint: string }> = {
  public: {
    label: "block text-sm font-semibold text-slate-700 mb-2",
    select: (bad) =>
      `w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-400 ${bad ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500"}`,
    error: "mt-1.5 text-xs text-red-600",
    hint: "mt-1.5 text-xs text-slate-500",
  },
  admin: {
    label: "block text-xs font-semibold text-gray-600 mb-1",
    select: (bad) =>
      `w-full px-3 py-2 bg-white border rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-400 ${bad ? "border-red-400" : "border-gray-200"}`,
    error: "mt-1 text-[11px] text-red-600",
    hint: "mt-1 text-[11px] text-gray-400",
  },
};

export interface CascadeOption {
  value: string;
  label: string;
}

/** One plain dropdown of the cascade. */
export function CascadeSelect({
  label, value, onChange, options, placeholder = "Choose", disabled, error, hint, required = true, variant = "public", testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly CascadeOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  variant?: CascadeVariant;
  testId?: string;
}) {
  const id = useId();
  const s = STYLES[variant];
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className={s.label}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={s.select(!!error)}
        data-testid={testId}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className={s.error}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={s.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Country: Rwanda first, then every country the backend accepts, by name. */
export function CountrySelect({ value, onChange, error, variant = "public", label = "Country" }: { value: string; onChange: (code: string) => void; error?: string; variant?: CascadeVariant; label?: string }) {
  const options = useMemo(() => countryOptions(), []);
  return <CascadeSelect label={label} value={value} onChange={onChange} options={options} placeholder="Choose the country" error={error} variant={variant} testId="cascade-country" />;
}

/**
 * Province → District → Sector of Rwanda, from the official list (GET /schools/locations).
 * Changing a level clears every level after it.
 */
export function PlaceSelects({
  value, onChange, errors = {}, variant = "public", labelPrefix = "", testIdPrefix = "cascade",
}: {
  value: Place;
  onChange: (p: Place) => void;
  errors?: Partial<Record<PlaceLevel, string>>;
  variant?: CascadeVariant;
  /** e.g. "Home " → "Home province" (a home location next to a school's place). */
  labelPrefix?: string;
  testIdPrefix?: string;
}) {
  const locations = useSchoolLocations();
  if (locations.isError) {
    return <p className={STYLES[variant].error} role="alert">Couldn&apos;t load the official province, district and sector list. {errorMessage(locations.error)}</p>;
  }
  const set = (level: PlaceLevel) => (v: string) => onChange(setPlaceLevel(value, level, v));
  const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  const loading = locations.isPending;
  const lbl = (s: string) => (labelPrefix ? `${labelPrefix}${s.toLowerCase()}` : s);
  return (
    <div className="grid gap-4">
      <CascadeSelect label={lbl("Province")} value={value.province} onChange={set("province")} options={opts(provincesOf(locations.data))} placeholder={loading ? "Loading…" : "Choose the province"} disabled={loading} error={errors.province} variant={variant} testId={`${testIdPrefix}-province`} />
      <CascadeSelect label={lbl("District")} value={value.district} onChange={set("district")} options={opts(districtsOf(locations.data, value.province))} placeholder={value.province ? "Choose the district" : "Choose the province first"} disabled={!value.province} error={errors.district} variant={variant} testId={`${testIdPrefix}-district`} />
      <CascadeSelect label={lbl("Sector")} value={value.sector} onChange={set("sector")} options={opts(sectorsOf(locations.data, value.province, value.district))} placeholder={value.district ? "Choose the sector" : "Choose the district first"} disabled={!value.district} error={errors.sector} variant={variant} testId={`${testIdPrefix}-sector`} />
    </div>
  );
}

/** The chosen school's official information (read-only, from its directory record). */
export function SchoolFactsPanel({ facts, variant = "public" }: { facts: { label: string; value: string }[]; variant?: CascadeVariant }) {
  const box = variant === "public" ? "rounded-lg border border-slate-200 bg-slate-50 px-4 py-3" : "rounded-lg border border-gray-100 bg-gray-50 px-3 py-2";
  const term = variant === "public" ? "text-xs text-slate-500" : "text-[11px] text-gray-400";
  const desc = variant === "public" ? "text-sm text-slate-800" : "text-xs text-gray-800";
  return (
    <dl className={`${box} grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5`} data-testid="school-facts">
      {facts.map((f) => (
        <div key={f.label} data-fact={f.label}>
          <dt className={term}>{f.label}</dt>
          <dd className={desc}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The active schools of one sector, by name (only once province, district and sector are chosen). */
export function useSchoolsInSector(place: Place, teacherEligible = false) {
  return useQuery({
    queryKey: ["schools", "in-place", place.province, place.district, place.sector, teacherEligible ? "teacher" : "all"],
    queryFn: async () =>
      byName(await schoolDirectoryApi.search({ province: place.province, district: place.district, sector: place.sector, ...(teacherEligible && { teacherEligible: "true" as const }) })),
    enabled: placeComplete(place),
    staleTime: 5 * 60_000,
  });
}

/**
 * The last step: the School dropdown of the chosen sector (GET /schools/search with the place —
 * never a search box). With `notListed` it ends with "My school is not listed". The chosen school's
 * official details are shown from its directory record. `teacherEligible`: only the schools a
 * Teacher may choose (official code, or administrator-created and verified).
 */
export function SectorSchoolSelect({
  place, schoolId, onChange, notListed, teacherEligible = false, error, label = "School", placeholder = "Choose the school", variant = "public",
}: {
  place: Place;
  /** The chosen school's id ("" for none). */
  schoolId: string;
  onChange: (school: DirectorySchool | null) => void;
  notListed?: { selected: boolean; onSelect: () => void };
  teacherEligible?: boolean;
  error?: string;
  label?: string;
  placeholder?: string;
  variant?: CascadeVariant;
}) {
  const schools = useSchoolsInSector(place, teacherEligible);
  const s = STYLES[variant];
  if (!placeComplete(place)) {
    return <CascadeSelect label={label} value="" onChange={() => undefined} options={[]} placeholder="Choose the sector first" disabled error={error} variant={variant} testId="cascade-school" />;
  }
  if (schools.isError) {
    return (
      <p className={s.error} role="alert" data-testid="schools-error">
        Couldn&apos;t load the schools of {place.sector}. {errorMessage(schools.error)}{" "}
        <button type="button" className="font-semibold underline" onClick={() => void schools.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  const list = schools.data ?? [];
  const chosen = schoolId ? list.find((x) => x.id === schoolId) ?? null : null;
  const selected = notListed?.selected ? NOT_LISTED : schoolId;
  return (
    <div className="space-y-3">
      <CascadeSelect
        label={label}
        value={selected}
        onChange={(id) => (id === NOT_LISTED ? notListed?.onSelect() : onChange(list.find((x) => x.id === id) ?? null))}
        disabled={schools.isPending}
        placeholder={schools.isPending ? "Loading schools…" : placeholder}
        options={[
          ...list.map((x) => ({ value: x.id, label: x.code ? `${x.name} (${x.code})` : x.name })),
          ...(notListed ? [{ value: NOT_LISTED, label: "My school is not listed" }] : []),
        ]}
        error={error}
        hint={!schools.isPending && list.length === 0 ? `No school is listed in ${place.sector} yet.${notListed ? " Choose “My school is not listed”." : ""}` : undefined}
        variant={variant}
        testId="cascade-school"
      />
      {chosen && !notListed?.selected && <SchoolFactsPanel variant={variant} facts={schoolFacts(chosen, place)} />}
      {schoolId && !chosen && !schools.isPending && !notListed?.selected && (
        // The chosen school is no longer listed in this sector (e.g. deactivated meanwhile).
        <p className={s.error} role="alert">
          That school is no longer listed here. Choose the school again.
        </p>
      )}
    </div>
  );
}
