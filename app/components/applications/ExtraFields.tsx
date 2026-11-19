"use client";

/** Application detail fields (capability applicationDetails): Teacher position / experience; Coach phone, affiliation, expertise, experience. */
import { useId } from "react";
import { TextField } from "@/app/components/ui/form";
import { LIMITS, type CoachExtraDraft, type TeacherExtraDraft } from "@/lib/accounts/application-details";

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
      {on("position") && <TextField label="Position or teaching role" name="position" required maxLength={LIMITS.position[1]} value={value.position} onChange={(e) => onChange("position", e.target.value)} error={errors.position} hint="For example: Mathematics teacher, Head of sciences, Director of studies." />}
      {on("yearsOfExperience") && <TextField label="Years of teaching experience" name="yearsOfExperience" inputMode="numeric" maxLength={2} value={value.yearsOfExperience} onChange={(e) => onChange("yearsOfExperience", e.target.value)} error={errors.yearsOfExperience} hint="Optional." />}
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
      {on("affiliation") && <TextField label="Institution or affiliation" name="affiliation" maxLength={LIMITS.affiliation[1]} value={value.affiliation} onChange={(e) => onChange("affiliation", e.target.value)} error={errors.affiliation} hint="Optional: your university, school, company or club." />}
      {on("expertise") && <AreaField label="Areas of expertise" name="expertise" required max={LIMITS.expertise[1]} value={value.expertise} onChange={(v) => onChange("expertise", v)} error={errors.expertise} hint="For example: combinatorics, number theory, algorithms." />}
      {on("relevantExperience") && <AreaField label="Relevant experience" name="relevantExperience" required max={LIMITS.relevantExperience[1]} value={value.relevantExperience} onChange={(v) => onChange("relevantExperience", v)} error={errors.relevantExperience} hint="Olympiad participation or coaching, teaching, competitions, mentoring." />}
      {on("yearsOfExperience") && <TextField label="Years of relevant experience" name="yearsOfExperience" inputMode="numeric" maxLength={2} value={value.yearsOfExperience} onChange={(e) => onChange("yearsOfExperience", e.target.value)} error={errors.yearsOfExperience} hint="Optional." />}
    </>
  );
}
