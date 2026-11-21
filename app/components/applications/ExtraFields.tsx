"use client";

/** Application detail fields (capability applicationDetails): Teacher position / experience; Coach phone, affiliation, expertise, experience. */
import { useId, useState } from "react";
import { TextField } from "@/app/components/ui/form";
import { LIMITS, TEACHER_POSITIONS, YEARS_OPTIONS, type CoachExtraDraft, type TeacherExtraDraft } from "@/lib/accounts/application-details";
import { EXPERIENCE_OPTIONS, EXPERTISE_GROUPS, OTHER_CHOICE, joinChoices, singleChoice, splitChoices, toggleChoice } from "@/lib/accounts/coach-choices";

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

/**
 * A single choice from a list, with "Other (type it)" showing a text box (position, occupation). The value is the
 * chosen label or the typed text; a refusal names (and focuses) the text box while Other is chosen.
 */
export function ChoiceWithOtherField({ label, name, options, placeholder, otherLabel, otherHint, value, onChange, error, max, hint }: {
  label: string; name: string; options: readonly string[]; placeholder: string; otherLabel: string; otherHint: string;
  value: string; onChange: (v: string) => void; error?: string; max: number; hint?: string;
}) {
  const [otherChosen, setOtherChosen] = useState(() => singleChoice(options, value) === OTHER_CHOICE);
  const choice = singleChoice(options, value, otherChosen);
  const other = choice === OTHER_CHOICE;
  return (
    <div className="space-y-3">
      <SelectField
        label={label}
        name={other ? `${name}Choice` : name}
        required
        value={choice}
        onChange={(v) => {
          setOtherChosen(v === OTHER_CHOICE);
          onChange(v === OTHER_CHOICE ? "" : v);
        }}
        options={[...options.map((o) => ({ value: o, label: o })), { value: OTHER_CHOICE, label: "Other (type it)" }]}
        placeholder={placeholder}
        error={other ? undefined : error}
        hint={other ? undefined : hint}
      />
      {other && (
        <TextField label={otherLabel} name={name} required autoFocus maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} error={error} hint={otherHint} />
      )}
    </div>
  );
}

/** Position: a dropdown of usual positions; "Other" shows a text box for one that is not listed. */
function PositionField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <ChoiceWithOtherField
      label="Position or teaching role" name="position" options={TEACHER_POSITIONS} placeholder="Choose your position"
      otherLabel="Your position or teaching role" otherHint="For example: Laboratory technician, Olympiad club coordinator."
      value={value} onChange={onChange} error={error} max={LIMITS.position[1]}
    />
  );
}

/**
 * Several choices (tick list, optionally grouped) with "Other" and a text box; the value is the text sent
 * ("Algebra; Geometry; Other: Game theory"; lib/accounts/coach-choices).
 */
export function MultiChoiceField({ label, name, groups, value, onChange, error, hint, otherPlaceholder, max }: {
  label: string; name: string; groups: ReadonlyArray<{ subject?: string; options: readonly string[] }>; value: string; onChange: (v: string) => void;
  error?: string; hint: string; otherPlaceholder: string; max: number;
}) {
  const all = groups.flatMap((g) => g.options);
  const [state, setState] = useState(() => splitChoices(all, value));
  const id = useId();
  const emit = (chosen: string[], other: string | null) => {
    setState({ chosen, other });
    onChange(joinChoices(all, chosen, other));
  };
  const box = "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500";
  return (
    <fieldset aria-describedby={`${id}-note`} data-testid={`${name}-choices`}>
      <legend className="block text-sm font-semibold text-slate-700 mb-2">
        {label} <span className="text-red-500">*</span>
      </legend>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.subject ?? "all"}>
            {g.subject && <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.subject}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {g.options.map((o) => (
                <label key={o} className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name={name} value={o} checked={state.chosen.includes(o)} onChange={() => emit(toggleChoice(state.chosen, o), state.other)} aria-invalid={error ? true : undefined} className={box} />
                  {o}
                </label>
              ))}
            </div>
          </div>
        ))}
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name={`${name}OtherOn`} checked={state.other !== null} onChange={() => emit(state.chosen, state.other === null ? "" : null)} aria-invalid={error ? true : undefined} className={box} />
          Other
        </label>
        {state.other !== null && (
          <input
            name={`${name}Other`}
            type="text"
            autoFocus
            aria-label={`${label}: other`}
            maxLength={max}
            placeholder={otherPlaceholder}
            value={state.other}
            onChange={(e) => emit(state.chosen, e.target.value)}
            className={`w-full px-4 py-3 bg-white border rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 ${error ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:ring-brand/20 focus:border-brand"}`}
          />
        )}
      </div>
      <p id={`${id}-note`} className={`mt-1.5 text-xs ${error ? "text-red-600" : "text-slate-600"}`}>{error ?? hint}</p>
    </fieldset>
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
      {on("expertise") && (
        <MultiChoiceField
          label="Areas of expertise" name="expertise" groups={EXPERTISE_GROUPS.map((g) => ({ subject: g.subject, options: g.areas }))}
          value={value.expertise} onChange={(v) => onChange("expertise", v)} error={errors.expertise} max={200}
          hint="Tick every area you know well; add another under Other." otherPlaceholder="For example: Game theory, Astronomy"
        />
      )}
      {on("relevantExperience") && (
        <MultiChoiceField
          label="Relevant experience" name="relevantExperience" groups={[{ options: EXPERIENCE_OPTIONS }]}
          value={value.relevantExperience} onChange={(v) => onChange("relevantExperience", v)} error={errors.relevantExperience} max={300}
          hint="Tick everything that applies; add anything else under Other." otherPlaceholder="For example: Olympiad team leader, Science club organiser"
        />
      )}
      {on("yearsOfExperience") && <YearsField label="Years of experience (optional)" value={value.yearsOfExperience} onChange={(v) => onChange("yearsOfExperience", v)} error={errors.yearsOfExperience} />}
    </>
  );
}
