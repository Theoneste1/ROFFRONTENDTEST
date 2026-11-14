"use client";

/**
 * Province → district → school pickers over the official directory (GET /schools/locations and
 * GET /schools/search?province=&district=). Used by teacher registration and by the
 * Administrator's teacher-application approval. Schools are sorted by name here
 * (lib/accounts/teacher-registration → sortSchools), whatever order the server used.
 */
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { schoolDirectoryApi, type DirectorySchool } from "@/lib/api/accounts";
import { errorMessage } from "@/lib/api/errors";
import { officialSchoolsOnly, sortSchools } from "@/lib/accounts/teacher-registration";
import { queryKeys } from "@/lib/query/keys";

export const selectCls = (bad: boolean) =>
  `w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 ${bad ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500"}`;

export function PlaceSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Choose",
  error,
  hint,
  disabled,
  required = true,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (string | { value: string; label: string })[];
  placeholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  testId?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={selectCls(!!error)}
        data-testid={testId}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          );
        })}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The active official schools of one district, sorted by name (only once both are chosen). */
export function useSchoolsInDistrict(province: string, district: string) {
  return useQuery({
    queryKey: queryKeys.schoolDirectory.byPlace(province, district),
    queryFn: async () => sortSchools(await schoolDirectoryApi.search({ province, district })),
    enabled: !!province && !!district,
    staleTime: 5 * 60_000,
  });
}

/**
 * The school select of a district, with its loading, empty and error (retry) states, and the
 * chosen school's code and sector shown read-only (they come from the directory, never typed).
 */
export function DistrictSchoolSelect({
  province,
  district,
  value,
  onChange,
  error,
  label = "School",
  officialOnly = false,
}: {
  province: string;
  district: string;
  value: Pick<DirectorySchool, "id" | "name" | "code" | "sector"> | null;
  onChange: (school: DirectorySchool | null) => void;
  error?: string;
  label?: string;
  /**
   * Only schools with an official code (teacher self-registration accepts no other). Since the
   * codeless-schools release the public search also returns schools without a code (`code: null`);
   * an Administrator's approval may still pick those.
   */
  officialOnly?: boolean;
}) {
  const all = useSchoolsInDistrict(province, district);
  const schools = officialOnly && all.data ? { ...all, data: officialSchoolsOnly(all.data) } : all;
  if (!province || !district) {
    return <PlaceSelect label={label} value="" onChange={() => undefined} options={[]} placeholder="Choose the province and district first" disabled error={error} />;
  }
  if (schools.isPending) {
    return <PlaceSelect label={label} value="" onChange={() => undefined} options={[]} placeholder="Loading schools…" disabled />;
  }
  if (schools.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert" data-testid="schools-error">
        <p>Couldn&apos;t load the schools of {district}. {errorMessage(schools.error)}</p>
        <button type="button" onClick={() => void schools.refetch()} className="mt-2 text-xs font-semibold text-[#2B2BB2] hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (schools.data.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600" data-testid="schools-empty">
        No schools found in this district.
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
  const chosen = value ? schools.data.find((s) => s.id === value.id) ?? value : null;
  return (
    <div className="space-y-3">
      <PlaceSelect
        label={label}
        value={chosen?.id ?? ""}
        onChange={(id) => onChange(schools.data.find((s) => s.id === id) ?? null)}
        options={schools.data.map((s) => ({ value: s.id, label: s.name }))}
        placeholder="Choose the school"
        error={error}
        testId="school-select"
      />
      {chosen && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm" data-testid="school-details">
          <div>
            <dt className="text-xs font-semibold text-slate-500">School code</dt>
            <dd className="text-slate-800">{chosen.code || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">Sector</dt>
            <dd className="text-slate-800">{chosen.sector || "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
