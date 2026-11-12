"use client";

/**
 * Choosing a school, in the three ways the backend accepts (lib/accounts/school-claim):
 * from the official directory (`GET /schools/search`), "my school is not listed"
 * (name + province / district / sector from `GET /schools/locations`), or a school
 * outside Rwanda. Used by student registration and the student's profile, only
 * when the backend advertises `schoolAffiliations`.
 */
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { schoolDirectoryApi } from "@/lib/api/accounts";
import { errorMessage } from "@/lib/api/errors";
import { countryLabel, SCHOOL_CLAIM_RULES, type SchoolClaimDraft, type SchoolClaimField } from "@/lib/accounts/school-claim";
import { TextField } from "@/app/components/ui/form";

const MODES: { value: SchoolClaimDraft["mode"]; label: string }[] = [
  { value: "directory", label: "Find my school" },
  { value: "notListed", label: "My school is not listed" },
  { value: "abroad", label: "School outside Rwanda" },
];

export const emptyDraft = (mode: SchoolClaimDraft["mode"]): SchoolClaimDraft =>
  mode === "directory" ? { mode, school: null } : mode === "notListed" ? { mode, name: "", province: "", district: "", sector: "" } : { mode, country: "", name: "" };

const selectCls = (bad: boolean) =>
  `w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${bad ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500"}`;

function Select({ label, value, onChange, options, error, disabled, placeholder }: { label: string; value: string; onChange: (v: string) => void; options: string[]; error?: string; disabled?: boolean; placeholder: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-2">
        {label} <span className="text-red-500">*</span>
      </label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} className={selectCls(!!error)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default function SchoolClaimFields({
  value,
  onChange,
  errors,
}: {
  value: SchoolClaimDraft;
  onChange: (d: SchoolClaimDraft) => void;
  errors: Partial<Record<SchoolClaimField, string>>;
}) {
  return (
    <fieldset className="space-y-4" data-testid="school-claim">
      <legend className="block text-sm font-semibold text-slate-700 mb-2">
        School <span className="text-red-500">*</span>
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to find your school">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={value.mode === m.value}
            onClick={() => value.mode !== m.value && onChange(emptyDraft(m.value))}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${value.mode === m.value ? "bg-[#2B2BB2] text-white border-[#2B2BB2]" : "bg-white text-slate-600 border-slate-300 hover:border-indigo-400"}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {value.mode === "directory" && <DirectoryPicker value={value} onChange={onChange} error={errors.school} />}
      {value.mode === "notListed" && <NotListed value={value} onChange={onChange} errors={errors} />}
      {value.mode === "abroad" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Country code"
            name="country"
            required
            maxLength={2}
            value={value.country}
            onChange={(e) => onChange({ ...value, country: e.target.value.toUpperCase() })}
            error={errors.country}
            hint={SCHOOL_CLAIM_RULES.countryPattern.test(value.country) ? countryLabel(value.country) : "Two letters, e.g. KE, UG, TZ"}
          />
          <TextField label="School name" name="schoolName" required maxLength={SCHOOL_CLAIM_RULES.nameMax} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} error={errors.schoolName} />
        </div>
      )}
      <p className="text-xs text-slate-500">An administrator verifies your school before it is shown as confirmed.</p>
    </fieldset>
  );
}

function DirectoryPicker({ value, onChange, error }: { value: Extract<SchoolClaimDraft, { mode: "directory" }>; onChange: (d: SchoolClaimDraft) => void; error?: string }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ["schools", "directory", term],
    queryFn: () => schoolDirectoryApi.search({ q: term }),
    enabled: term.length >= 2,
    staleTime: 60_000,
  });

  if (value.school) {
    return (
      <div>
        <div className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 text-sm ${error ? "border-red-400" : "border-slate-300"}`} data-testid="school-chosen">
          <span className="min-w-0">
            <span className="font-semibold text-slate-800">{value.school.name}</span>
            <span className="block text-xs text-slate-500">School code {value.school.code}</span>
          </span>
          <button type="button" onClick={() => onChange({ mode: "directory", school: null })} className="text-xs font-semibold text-[#2B2BB2] hover:underline shrink-0">
            Change
          </button>
        </div>
        {/* A chosen school can still be refused (same school already pending, or a server check). */}
        {error && (
          <p className="mt-1.5 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
  return (
    <div>
      <TextField label="Search by school name or code" name="schoolSearch" type="search" autoComplete="off" maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} error={error} hint="Type at least 2 letters." />
      {term.length >= 2 && (
        <div className="mt-2 border border-slate-200 rounded-lg max-h-56 overflow-y-auto" data-testid="school-results">
          {results.isPending ? (
            <p className="px-4 py-3 text-xs text-slate-500">Searching…</p>
          ) : results.isError ? (
            <p className="px-4 py-3 text-xs text-red-600">{errorMessage(results.error)}</p>
          ) : results.data.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">No school matches “{term}”. Try another spelling, or choose “My school is not listed”.</p>
          ) : (
            results.data.map((s) => (
              <button key={s.id} type="button" onClick={() => onChange({ mode: "directory", school: { code: s.code, name: s.name } })} className="block w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 border-b border-slate-100 last:border-0">
                <span className="font-medium text-slate-800">{s.name}</span>
                <span className="block text-xs text-slate-500">
                  {[s.sector, s.district].filter(Boolean).join(", ") || s.location} · code {s.code}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NotListed({ value, onChange, errors }: { value: Extract<SchoolClaimDraft, { mode: "notListed" }>; onChange: (d: SchoolClaimDraft) => void; errors: Partial<Record<SchoolClaimField, string>> }) {
  const places = useQuery({ queryKey: ["schools", "locations"], queryFn: schoolDirectoryApi.locations, staleTime: 60 * 60_000 });
  const provinces = places.data ?? [];
  const districts = provinces.find((p) => p.province === value.province)?.districts ?? [];
  const sectors = districts.find((d) => d.district === value.district)?.sectors ?? [];
  return (
    <div className="space-y-4">
      <TextField label="School name" name="schoolName" required maxLength={SCHOOL_CLAIM_RULES.nameMax} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} error={errors.schoolName} />
      {places.isError ? (
        <p className="text-xs text-red-600">{errorMessage(places.error)}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Province" placeholder={places.isPending ? "Loading…" : "Choose"} disabled={places.isPending} value={value.province} onChange={(v) => onChange({ ...value, province: v, district: "", sector: "" })} options={provinces.map((p) => p.province)} error={errors.province} />
          <Select label="District" placeholder="Choose" disabled={!value.province} value={value.district} onChange={(v) => onChange({ ...value, district: v, sector: "" })} options={districts.map((d) => d.district)} error={errors.district} />
          <Select label="Sector" placeholder="Choose" disabled={!value.district} value={value.sector} onChange={(v) => onChange({ ...value, sector: v })} options={sectors} error={errors.sector} />
        </div>
      )}
    </div>
  );
}
