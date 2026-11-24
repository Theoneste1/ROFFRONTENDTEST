"use client";

/**
 * Olympiad interests as a group of checkboxes (Mathematics, Computing, Physics; several at once). With `onOtherChange`
 * (backends with olympiadInterestOther) an "Other" checkbox too: ticked, it shows a text box for the Olympiad's name;
 * `other` is null while unticked.
 */
import { OLYMPIAD_SUBJECTS, OTHER_INTEREST_MAX, toggleInterest, type OlympiadSubject } from "@/lib/accounts/olympiad-interests";

export default function OlympiadInterestsField({
  value,
  onChange,
  error,
  required = true,
  label = "Olympiad interests",
  hint = "The Olympiads you would like to take part in. Choose at least one; you can change them later on your profile.",
  idPrefix = "olympiadInterests",
  other,
  onOtherChange,
}: {
  value: readonly OlympiadSubject[];
  onChange: (next: OlympiadSubject[]) => void;
  error?: string;
  required?: boolean;
  label?: string;
  hint?: string;
  idPrefix?: string;
  /** The other Olympiad's name; null while "Other" is not ticked. */
  other?: string | null;
  /** Shows the "Other" checkbox (only when the backend accepts it). */
  onOtherChange?: (next: string | null) => void;
}) {
  const otherOn = other !== null && other !== undefined;
  const described = error ? `${idPrefix}-error` : `${idPrefix}-hint`;
  return (
    <fieldset aria-describedby={described} data-testid="olympiad-interests">
      <legend className="block text-sm font-semibold text-slate-700 mb-2">
        {label} {required && <span className="text-amber-600">*</span>}
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
        {onOtherChange && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="olympiadInterestOtherOn"
              checked={otherOn}
              onChange={() => onOtherChange(otherOn ? null : "")}
              aria-invalid={error ? true : undefined}
              data-testid="olympiad-interest-other-toggle"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Other
          </label>
        )}
      </div>
      {onOtherChange && otherOn && (
        <div className="mt-3">
          <label htmlFor={`${idPrefix}-other`} className="block text-sm font-semibold text-slate-700 mb-2">
            Which other Olympiad? <span className="text-amber-600">*</span>
          </label>
          <input
            id={`${idPrefix}-other`}
            name="olympiadInterestOther"
            type="text"
            autoFocus
            maxLength={OTHER_INTEREST_MAX}
            placeholder="For example: Chemistry, Biology, Astronomy"
            value={other ?? ""}
            onChange={(e) => onOtherChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            className={`w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${error ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-brand/20 focus:border-brand"}`}
          />
        </div>
      )}
      {error ? (
        <p id={`${idPrefix}-error`} className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : (
        <p id={`${idPrefix}-hint`} className="mt-1.5 text-xs text-slate-600">{hint}</p>
      )}
    </fieldset>
  );
}
