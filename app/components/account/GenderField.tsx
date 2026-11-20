"use client";

/** Gender (required at sign-up): two large choices side by side, Female and Male (lib/accounts/gender). */
import { GENDER_OPTIONS, type Gender } from "@/lib/accounts/gender";

export default function GenderField({
  value,
  onChange,
  error,
  label = "Gender",
}: {
  value: Gender | "";
  onChange: (next: Gender) => void;
  error?: string;
  label?: string;
}) {
  return (
    <fieldset aria-describedby={error ? "gender-error" : undefined} data-testid="gender-field">
      <legend className="mb-2 block text-sm font-semibold text-slate-700">
        {label} <span className="text-red-500">*</span>
      </legend>
      <div className="grid grid-cols-2 gap-3 rounded-lg focus:outline-none" role="radiogroup" aria-label={label} aria-required="true" aria-invalid={error ? true : undefined} tabIndex={error ? -1 : undefined}>
        {GENDER_OPTIONS.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-3 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-brand/30 ${
                checked ? "border-brand bg-brand/5 text-brand" : error ? "border-red-400 text-slate-700" : "border-slate-300 text-slate-700 hover:border-slate-400"
              }`}
            >
              <input
                type="radio"
                name="gender"
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="h-4 w-4 border-slate-300 text-brand focus:ring-brand"
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && <p id="gender-error" className="mt-1.5 text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}
