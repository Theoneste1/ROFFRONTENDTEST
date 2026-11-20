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

/**
 * The sign-up layouts (app/components/forms/FormWizard): "wide" (more than 640px: two columns, fewer steps) and "narrow"
 * (phones up to 640px: one column, more and smaller steps), so every step fits the window without scrolling.
 */
export type WizardLayout = "wide" | "narrow";

/** The media query of the wide layout (the CSS variant `wizard-wide` in app/globals.css uses the same one). */
export const WIDE_LAYOUT_QUERY = "(width > 640px)";

/** A block of a form shown on one step: one field (or a group of fields shown together) and the error keys it holds. */
export interface WizardPart {
  id: string;
  fields: readonly string[];
  /** Spans both columns of the wide layout (text areas, check boxes, the picture, the school details). */
  wide?: boolean;
  /** Its place in the form (set by buildSteps): the parts stay in this order in the page whatever the grouping. */
  order?: number;
}

/**
 * A named phase of a form ("About you", "Studies & school", "Account"): the progress indicator shows the phases; a phase
 * with more fields than one window holds is shown on several steps (screens) in a row, "2 of 3" inside the phase.
 */
export interface WizardPhaseName {
  id: string;
  title: string;
}

/** A step with its parts (in the forms' order); `fields` is every error key of those parts. */
export interface WizardPartStep extends WizardStepModel {
  description?: string;
  /** The phase this step (screen) belongs to; a step without one is a phase of its own. */
  phase?: WizardPhaseName;
  parts: readonly WizardPart[];
}

/** A step of one layout: its title, its phase and the ids of its parts. */
export interface StepPlan {
  id: string;
  title: string;
  description?: string;
  phase?: WizardPhaseName;
  parts: readonly string[];
}

/**
 * The steps of one layout from the form's parts: each step keeps the parts the form shows (`present`, default all), a step
 * left without any is dropped (e.g. the personal details on a backend that does not ask for them).
 */
export function buildSteps(parts: readonly WizardPart[], plan: readonly StepPlan[], present?: (id: string) => boolean): WizardPartStep[] {
  const byId = new Map<string, WizardPart>(parts.map((p, order) => [p.id, { ...p, order }]));
  const steps: WizardPartStep[] = [];
  for (const s of plan) {
    const own = s.parts.map((id) => byId.get(id)).filter((p): p is WizardPart => !!p && (present ? present(p.id) : true));
    if (own.length)
      steps.push({ id: s.id, title: s.title, ...(s.description && { description: s.description }), ...(s.phase && { phase: s.phase }), parts: own, fields: own.flatMap((p) => p.fields) });
  }
  return steps;
}

/**
 * The step to show after the grouping changed (the window crossed 640px, e.g. a phone turned; or a part came or went, e.g.
 * a school abroad has no province): the one holding the part the person was on (`anchor`, when it is on the shown step),
 * otherwise the shown step's first part still there. Nothing typed is lost: every part stays in the page, only the
 * grouping changes.
 */
export function remapStep(from: readonly Pick<WizardPartStep, "parts">[], to: readonly Pick<WizardPartStep, "parts">[], index: number, anchor?: string | null): number {
  const ids = (from[clampStep(index, from.length)]?.parts ?? []).map((p) => p.id);
  const candidates = anchor && ids.includes(anchor) ? [anchor, ...ids.filter((id) => id !== anchor)] : ids;
  for (const id of candidates) {
    const at = to.findIndex((s) => s.parts.some((p) => p.id === id));
    if (at !== -1) return at;
  }
  return clampStep(index, to.length);
}

/** What identifies a grouping: its steps and their parts (a new grouping is remapped with remapStep). */
export function stepsSignature(steps: readonly Pick<WizardPartStep, "id" | "parts">[]): string {
  return steps.map((s) => `${s.id}:${s.parts.map((p) => p.id).join(",")}`).join("|");
}

// ─── Phases ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A phase as shown: its name, its first step and how many steps (screens) it has. */
export interface WizardPhase extends WizardPhaseName {
  first: number;
  count: number;
}

/**
 * The phases of a grouping, in order: consecutive steps of the same phase form one phase (a phase whose steps all left,
 * e.g. the details on an older backend, is not shown); a step without a phase is a phase of its own, named after it.
 */
export function phasesOf(steps: readonly Pick<WizardPartStep, "id" | "title" | "phase">[]): WizardPhase[] {
  const phases: WizardPhase[] = [];
  steps.forEach((s, i) => {
    const name = s.phase ?? { id: s.id, title: s.title };
    const last = phases[phases.length - 1];
    if (last && s.phase && last.id === name.id) last.count += 1;
    else phases.push({ id: name.id, title: name.title, first: i, count: 1 });
  });
  return phases;
}

/** The phase holding a step (-1 when none does). */
export function phaseOfStep(phases: readonly WizardPhase[], index: number): number {
  return phases.findIndex((p) => index >= p.first && index < p.first + p.count);
}

/** Phases before the shown step's are complete, its own is current, the rest are still to come. */
export function phaseStatus(phases: readonly WizardPhase[], phase: number, index: number): StepStatus {
  return stepStatus(phase, phaseOfStep(phases, index));
}

/** Where a step is inside its phase: "2 of 3" (null when the phase has one step: nothing to say). */
export function screenLabel(phases: readonly WizardPhase[], index: number): string | null {
  const p = phases[phaseOfStep(phases, index)];
  if (!p || p.count < 2) return null;
  return `${index - p.first + 1} of ${p.count}`;
}
