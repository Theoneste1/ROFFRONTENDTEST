"use client";

/**
 * Shared building blocks of the standard school selection (lib/schools/school-cascade.ts):
 *
 *   Country → Province → District → Sector → School
 *
 * Plain dropdowns only (no search box): each one lists the options of the step before it, from
 * the official directory, and is disabled until that step is chosen. Used by student registration,
 * the student's profile, and every administrator form that names a school (SchoolPicker).
 * `variant` keeps each page's existing look: "public" (sign-up / profile), "admin" (admin pages).
 */
import { useId, useMemo, type ReactNode } from "react";
import { errorMessage } from "@/lib/api/errors";
import { countryOptions } from "@/lib/schools/countries";
import { districtsOf, provincesOf, sectorsOf, setPlaceLevel, type Place, type PlaceLevel } from "@/lib/schools/school-cascade";
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
  value, onChange, errors = {}, variant = "public",
}: {
  value: Place;
  onChange: (p: Place) => void;
  errors?: Partial<Record<PlaceLevel, string>>;
  variant?: CascadeVariant;
}) {
  const locations = useSchoolLocations();
  if (locations.isError) {
    return <p className={STYLES[variant].error} role="alert">Couldn&apos;t load the official province, district and sector list. {errorMessage(locations.error)}</p>;
  }
  const set = (level: PlaceLevel) => (v: string) => onChange(setPlaceLevel(value, level, v));
  const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
  const loading = locations.isPending;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <CascadeSelect label="Province" value={value.province} onChange={set("province")} options={opts(provincesOf(locations.data))} placeholder={loading ? "Loading…" : "Choose the province"} disabled={loading} error={errors.province} variant={variant} testId="cascade-province" />
      <CascadeSelect label="District" value={value.district} onChange={set("district")} options={opts(districtsOf(locations.data, value.province))} placeholder={value.province ? "Choose the district" : "Choose the province first"} disabled={!value.province} error={errors.district} variant={variant} testId="cascade-district" />
      <CascadeSelect label="Sector" value={value.sector} onChange={set("sector")} options={opts(sectorsOf(locations.data, value.province, value.district))} placeholder={value.district ? "Choose the sector" : "Choose the district first"} disabled={!value.district} error={errors.sector} variant={variant} testId="cascade-sector" />
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
