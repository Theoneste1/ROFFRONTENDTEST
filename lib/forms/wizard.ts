/**
 * The multi-step registration forms (app/components/forms/FormWizard): which step a field lives on, where to go after a
 * failed check or a refused submission, and the texts of the progress indicator. Pure logic, unit-tested in
 * tests/form-wizard.test.mjs.
 *
 * The steps only split an existing form: its fields, rules, request and error mapping stay exactly as they were. A step
 * is checked with the form's own validation, keeping only the errors of the fields on that step.
 */

/** One step of a form: its title (shown in the progress indicator and as the step heading) and the fields on it. */
export interface WizardStepModel {
  id: string;
  title: string;
  /** Error keys of the fields on this step (the keys the form's validation and server mapping use). */
  fields: readonly string[];
}

export type StepStatus = "complete" | "current" | "upcoming";

/** "Step 2 of 4". */
export function progressLabel(index: number, count: number): string {
  return `Step ${index + 1} of ${count}`;
}

/** Earlier steps are complete, the shown one is current, the rest are still to come. */
export function stepStatus(index: number, current: number): StepStatus {
  return index < current ? "complete" : index === current ? "current" : "upcoming";
}

/** What the live region says when a step is shown: "Step 2 of 4: Your studies". */
export function stepAnnouncement(steps: readonly Pick<WizardStepModel, "title">[], index: number): string {
  return `${progressLabel(index, steps.length)}: ${steps[index]?.title ?? ""}`;
}

/** What the live region says when the shown step has errors. */
export function invalidAnnouncement(steps: readonly Pick<WizardStepModel, "title">[], index: number): string {
  return `${stepAnnouncement(steps, index)}. Please check the highlighted fields.`;
}

/** The step a field lives on, or -1 when no step has it. */
export function stepOfField(steps: readonly WizardStepModel[], field: string): number {
  return steps.findIndex((s) => s.fields.includes(field));
}

/** Keys of the errors that are set (an error map may hold `undefined` for a cleared field). */
export function errorKeys(...maps: readonly (Readonly<Record<string, unknown>> | null | undefined)[]): string[] {
  const keys: string[] = [];
  for (const m of maps) for (const [k, v] of Object.entries(m ?? {})) if (v) keys.push(k);
  return keys;
}

/** The first step holding one of these errors, or -1 when none of them is on a step. */
export function firstStepWithError(steps: readonly WizardStepModel[], keys: readonly string[]): number {
  let first = -1;
  for (const k of keys) {
    const i = stepOfField(steps, k);
    if (i !== -1 && (first === -1 || i < first)) first = i;
  }
  return first;
}

/** Only the errors of the fields on one step (the form's own rules, applied to the step being left). */
export function pickStepErrors<K extends string, V>(step: Pick<WizardStepModel, "fields">, errors: Partial<Record<K, V>>): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  for (const [k, v] of Object.entries(errors) as [K, V | undefined][]) if (v && step.fields.includes(k)) out[k] = v;
  return out;
}

/** A step index kept inside the form (0 … count − 1). */
export function clampStep(index: number, count: number): number {
  return Math.max(0, Math.min(index, count - 1));
}

/**
 * The wizard's submit button is "Next" before the last step and the form's own submit label on it. The second click of
 * a double click (event.detail > 1) is ignored, so a double click on "Next" can never land on the final submit button
 * and send the form; Enter in a field (detail 0) and single clicks work as usual.
 */
export function ignoreRepeatedClick(detail: number): boolean {
  return detail > 1;
}

/**
 * The errors after checking one step: that step's fields get the new result (an empty one clears them); the errors
 * already shown on other steps (e.g. from a refused submission) stay until those steps are checked again.
 */
export function replaceStepErrors<K extends string, V>(
  step: Pick<WizardStepModel, "fields">,
  shown: Partial<Record<K, V>>,
  checked: Partial<Record<K, V>>,
): Partial<Record<K, V>> {
  const out: Partial<Record<K, V>> = {};
  for (const [k, v] of Object.entries(shown) as [K, V | undefined][]) if (v && !step.fields.includes(k)) out[k] = v;
  return { ...out, ...pickStepErrors(step, checked) };
}

/** Which step is shown, and what happened last (`focus`: where focus goes; `seq` counts the moves, so each is handled once). */
export interface WizardState {
  index: number;
  seq: number;
  focus: "heading" | "invalid" | "message" | null;
}

export type WizardAction = { type: "next" } | { type: "back" } | { type: "errors"; step?: number } | { type: "message" };

export const INITIAL_WIZARD: WizardState = { index: 0, seq: 0, focus: null };

/**
 * Next / Back move one step (never past the first or the last), focus then goes to the step heading. "errors" shows a
 * step with errors (the shown one when no step, or -1, is given), focus then goes to its first highlighted field.
 * "message" stays on the shown step and brings the form's message (e.g. a refusal that names no field) into view.
 */
export function wizardReducer(count: number, s: WizardState, a: WizardAction): WizardState {
  const at = clampStep(s.index, count);
  if (a.type === "next") return { index: clampStep(at + 1, count), seq: s.seq + 1, focus: "heading" };
  if (a.type === "back") return { index: clampStep(at - 1, count), seq: s.seq + 1, focus: "heading" };
  if (a.type === "message") return { index: at, seq: s.seq + 1, focus: "message" };
  const step = a.step == null || a.step < 0 ? at : clampStep(a.step, count);
  return { index: step, seq: s.seq + 1, focus: "invalid" };
}
