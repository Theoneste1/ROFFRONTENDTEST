"use client";

/** Olympiad interests as a group of checkboxes (Mathematics, Computing, Physics; several at once). */
import { OLYMPIAD_SUBJECTS, toggleInterest, type OlympiadSubject } from "@/lib/accounts/olympiad-interests";

export default function OlympiadInterestsField({
  value,
  onChange,
  error,
  required = true,
  label = "Olympiad interests",
  hint = "The Olympiads you would like to take part in. Choose at least one; you can change them later on your profile.",
  idPrefix = "olympiadInterests",
}: {
  value: readonly OlympiadSubject[];
  onChange: (next: OlympiadSubject[]) => void;
  error?: string;
  required?: boolean;
  label?: string;
  hint?: string;
  idPrefix?: string;
}) {
  const described = error ? `${idPrefix}-error` : `${idPrefix}-hint`;
  return (
    <fieldset aria-describedby={described} data-testid="olympiad-interests">
      <legend className="block text-sm font-semibold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </legend>
      <div className="flex flex-wrap gap-4">
        {OLYMPIAD_SUBJECTS.map((s) => (
          <label key={s.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="olympiadInterests"
              value={s.value}
              checked={value.includes(s.value)}
              onChange={() => onChange(toggleInterest(value, s.value))}
              aria-invalid={error ? true : undefined}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            {s.label}
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${idPrefix}-error`} className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        <p id={`${idPrefix}-hint`} className="mt-1.5 text-xs text-slate-600">{hint}</p>
      )}
    </fieldset>
  );
}
