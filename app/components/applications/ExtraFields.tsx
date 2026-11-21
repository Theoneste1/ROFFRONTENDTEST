"use client";

/** Application detail fields (capability applicationDetails): Teacher position / experience; Coach phone, affiliation, expertise, experience. */
import { useId, useState } from "react";
import { TextField } from "@/app/components/ui/form";
import {
  LIMITS, OTHER_POSITION, TEACHER_POSITIONS, YEARS_OPTIONS, positionChoice, type CoachExtraDraft, type TeacherExtraDraft,
} from "@/lib/accounts/application-details";

/** A dropdown in the style of the sign-up forms' fields. */
function SelectField({ label, name, value, onChange, options, placeholder, error, hint, required }: {
  label: string; name: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }>;
  placeholder: string; error?: string; hint?: string; required?: boolean;
}) {
  const id = useId();
  const optional = /\(optional\)$/.exec(label);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-2">
        {optional ? <>{label.slice(0, optional.index).trim()} <span className="font-normal text-slate-600">(optional)</span></> : label}{" "}
        {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={`w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${error ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-brand/20 focus:border-brand"}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {(error || hint) && <p id={`${id}-note`} className={`mt-1.5 text-xs ${error ? "text-red-600" : "text-slate-600"}`}>{error ?? hint}</p>}
    </div>
  );
}

/** Years of experience: a dropdown of 0–60 (optional). */
function YearsField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  return <SelectField label={label} name="yearsOfExperience" value={value} onChange={onChange} options={YEARS_OPTIONS} placeholder="Choose (optional)" error={error} />;
}

/** Position: a dropdown of usual positions; "Other" shows a text box for one that is not listed. */
function PositionField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const [otherChosen, setOtherChosen] = useState(() => positionChoice(value) === OTHER_POSITION);
  const choice = positionChoice(value, otherChosen);
  const other = choice === OTHER_POSITION;
  return (
    <div className="space-y-3">
      <SelectField
        label="Position or teaching role"
        // The field a refusal names (and focuses) is the text box while Other is chosen.
        name={other ? "positionChoice" : "position"}
        required
        value={choice}
        onChange={(v) => {
          if (v === OTHER_POSITION) {
            setOtherChosen(true);
            onChange("");
          } else {
            setOtherChosen(false);
            onChange(v);
          }
        }}
        options={[...TEACHER_POSITIONS.map((p) => ({ value: p, label: p })), { value: OTHER_POSITION, label: "Other (type it)" }]}
        placeholder="Choose your position"
        error={other ? undefined : error}
      />
      {other && (
        <TextField
          label="Your position or teaching role"
          name="position"
          required
          autoFocus
          maxLength={LIMITS.position[1]}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          hint="For example: Laboratory technician, Olympiad club coordinator."
        />
      )}
    </div>
  );
}

export function AreaField({ label, value, onChange, error, hint, required, max, name }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; required?: boolean; max: number; name: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={3}
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        className={`w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${error ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500"}`}
      />
      {(error || hint) && <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-slate-600"}`}>{error ?? hint}</p>}
    </div>
  );
}

export function TeacherExtraFields({ value, onChange, errors, only }: {
  value: TeacherExtraDraft; onChange: (k: keyof TeacherExtraDraft, v: string) => void; errors: Partial<Record<keyof TeacherExtraDraft, string>>;
  /** Only this field (a form that places the fields separately, e.g. the registration steps). */
  only?: keyof TeacherExtraDraft;
}) {
  const on = (k: keyof TeacherExtraDraft) => !only || only === k;
  return (
    <>
      {on("position") && <PositionField value={value.position} onChange={(v) => onChange("position", v)} error={errors.position} />}
      {on("yearsOfExperience") && <YearsField label="Years of experience (optional)" value={value.yearsOfExperience} onChange={(v) => onChange("yearsOfExperience", v)} error={errors.yearsOfExperience} />}
    </>
  );
}

export function CoachExtraFields({ value, onChange, errors, only }: {
  value: CoachExtraDraft; onChange: (k: keyof CoachExtraDraft, v: string) => void; errors: Partial<Record<keyof CoachExtraDraft, string>>;
  /** Only this field (a form that places the fields separately, e.g. the registration steps). */
  only?: keyof CoachExtraDraft;
}) {
  const on = (k: keyof CoachExtraDraft) => !only || only === k;
  return (
    <>
      {on("phone") && <TextField label="Phone number" name="phone" type="tel" autoComplete="tel" required maxLength={40} value={value.phone} onChange={(e) => onChange("phone", e.target.value)} error={errors.phone} hint="Rwanda: 07XXXXXXXX. Elsewhere: +country code and number." />}
      {on("affiliation") && <TextField label="Institution or affiliation (optional)" name="affiliation" maxLength={LIMITS.affiliation[1]} value={value.affiliation} onChange={(e) => onChange("affiliation", e.target.value)} error={errors.affiliation} hint="Optional: your university, school, company or club." />}
      {on("expertise") && <AreaField label="Areas of expertise" name="expertise" required max={LIMITS.expertise[1]} value={value.expertise} onChange={(v) => onChange("expertise", v)} error={errors.expertise} hint="For example: combinatorics, number theory, algorithms." />}
      {on("relevantExperience") && <AreaField label="Relevant experience" name="relevantExperience" required max={LIMITS.relevantExperience[1]} value={value.relevantExperience} onChange={(v) => onChange("relevantExperience", v)} error={errors.relevantExperience} hint="Olympiad participation or coaching, teaching, competitions, mentoring." />}
      {on("yearsOfExperience") && <YearsField label="Years of experience (optional)" value={value.yearsOfExperience} onChange={(v) => onChange("yearsOfExperience", v)} error={errors.yearsOfExperience} />}
    </>
  );
}
