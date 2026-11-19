"use client";

/**
 * A long form shown one step at a time (Student, Teacher and Coach registration). The form keeps its own state, rules,
 * request and error mapping; this only shows one step, the progress, Back / Next and the form's own submit button on the
 * last step. Rules: lib/forms/wizard.ts (unit-tested in tests/form-wizard.test.mjs).
 *
 * - The form is cut into parts (lib/forms/registration-steps.ts), grouped into steps per layout: "wide" (more than 640px)
 *   shows the fields in two columns, "narrow" (phones) in one column with more and smaller steps, so every step fits
 *   the window: no scrolling, neither the page nor the card. When the grouping changes (the window crosses 640px, e.g. a
 *   phone turned) the step holding the field the person was on is shown.
 * - Every part stays mounted (only the shown step's are visible), so nothing typed or chosen is lost moving back and
 *   forth or when the grouping changes.
 * - The submit button reads "Next" before the last step: the form's submit handler checks the shown step with the form's
 *   own validation and moves on (useFormWizard → next), or sends the form on the last step. Enter in a one-line field
 *   therefore moves to the next step and never sends early; a text area keeps Enter for new lines.
 * - Focus moves to the step heading after Next / Back, or to the first highlighted field when a step has errors; a live
 *   region announces the step ("Step 2 of 4: Your studies") and its errors. The progress list marks the shown step with
 *   aria-current="step".
 * - Back on the left, Next / submit on the right: never stretched on the wide layout, full width on phones.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/app/components/ui/form";
import {
  clampStep,
  ignoreRepeatedClick,
  invalidAnnouncement,
  progressLabel,
  remapStep,
  stepAnnouncement,
  stepStatus,
  stepsSignature,
  wizardReducer,
  INITIAL_WIZARD,
  WIDE_LAYOUT_QUERY,
  type WizardAction,
  type WizardLayout,
  type WizardPartStep,
  type WizardState,
} from "@/lib/forms/wizard";

/** Classes for the <form> holding a wizard (the page around it fits the window: app/components/shell/AuthShell). */
export const WIZARD_FORM_CLASS = "flex flex-col";

function subscribeLayout(onChange: () => void) {
  const query = window.matchMedia(WIDE_LAYOUT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** "wide" above 640px, "narrow" on phones (the server renders the wide layout; the browser corrects it at once). */
export function useWizardLayout(): WizardLayout {
  return useSyncExternalStore(
    subscribeLayout,
    () => (window.matchMedia(WIDE_LAYOUT_QUERY).matches ? "wide" : "narrow"),
    () => "wide",
  );
}

interface WizardHookState extends WizardState {
  /** The grouping shown (stepsSignature) and its steps: a new grouping is remapped to the step the person was on. */
  sig: string;
  steps: readonly WizardPartStep[];
  /** The part that last had focus. */
  anchor: string | null;
}

/** Which step is shown, and what happened last (so the wizard moves focus and announces it). Rules: wizardReducer. */
export function useFormWizard(steps: readonly WizardPartStep[]) {
  const sig = stepsSignature(steps);
  const [state, setState] = useState<WizardHookState>(() => ({ ...INITIAL_WIZARD, sig, steps, anchor: null }));
  // A new grouping (the layout changed, or a part came or went): the step holding the part the person was on.
  // State adjusted during render (not in an effect), so the wrong step is never shown. Focus does not move.
  if (state.sig !== sig) setState((s) => ({ ...s, sig, steps, index: remapStep(s.steps, steps, s.index, s.anchor) }));
  const count = steps.length;
  const index = clampStep(state.index, count);
  const go = (a: WizardAction) => setState((s) => ({ ...s, ...wizardReducer(count, s, a) }));
  return {
    index,
    count,
    isFirst: index === 0,
    isLast: index >= count - 1,
    event: state.focus ? { seq: state.seq, focus: state.focus } : null,
    /** The shown step passed the form's checks: show the next one. */
    next: () => go({ type: "next" }),
    back: () => go({ type: "back" }),
    /** Show a step with errors (default: the shown one): focus goes to its first highlighted field. */
    showErrors: (step?: number) => go({ type: "errors", step }),
    /** A refusal that names no field: its message (above the steps) is brought into view; its alert announces it. */
    showMessage: () => go({ type: "message" }),
    /** The part that has focus (kept for a change of grouping). */
    setAnchor: (part: string | null) => setState((s) => (s.anchor === part ? s : { ...s, anchor: part })),
  };
}

export type FormWizardState = ReturnType<typeof useFormWizard>;

const circle = "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors";
const CIRCLE = {
  complete: `${circle} bg-[#2B2BB2] text-white`,
  current: `${circle} bg-indigo-50 text-[#2B2BB2] ring-2 ring-[#2B2BB2]`,
  upcoming: `${circle} bg-white text-slate-600 ring-1 ring-slate-300`,
} as const;
const STATUS_TEXT = { complete: "completed", current: "current step", upcoming: "not started" } as const;

/**
 * Compact fields inside the wizard (the shared inputs keep their size elsewhere): less space under labels, less input
 * padding, hints and errors closer to their field. Text stays 14px; inputs are 38px tall.
 */
const COMPACT_FIELDS = [
  "[&_label.block]:mb-1 [&_legend]:mb-1 [&_select]:py-2 [&_textarea]:py-2 [&_input:not([type=checkbox]):not([type=file])]:py-2 [&_[id$=-hint]]:mt-1 [&_[id$=-error]]:mt-1",
  // The chosen school's details: two columns on phones, three on the wide layout.
  "[&_[data-testid=school-facts]]:grid-cols-2 [&_[data-testid=school-facts]]:gap-y-1 [&_[data-testid=school-facts]]:py-2 wizard-wide:[&_[data-testid=school-facts]]:grid-cols-3",
].join(" ");

export default function FormWizard({
  wizard,
  steps,
  parts,
  submitLabel,
  submittingLabel,
  submitting = false,
  header,
  intro,
  notices,
  footer,
  label = "Registration steps",
}: {
  wizard: FormWizardState;
  /** The steps of the shown layout (lib/forms/registration-steps.ts). */
  steps: readonly WizardPartStep[];
  /** The content of each part, by part id. */
  parts: Readonly<Record<string, ReactNode>>;
  submitLabel: string;
  submittingLabel: string;
  submitting?: boolean;
  /** Above the steps (the switch, the page heading). */
  header?: ReactNode;
  /** The page's explanation under the heading: on every step of the wide layout, on the first step on phones. */
  intro?: ReactNode;
  /** Messages above the steps (a refused submission, the administrators' instructions): always shown. */
  notices?: ReactNode;
  /** Beside Back / Next (under them on phones), e.g. "Already have an account? Sign in". */
  footer?: ReactNode;
  label?: string;
}) {
  const id = useId();
  const layout = useWizardLayout();
  const body = useRef<HTMLDivElement>(null);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const fields = useRef<HTMLDivElement>(null);
  const { index, event } = wizard;
  const seq = event?.seq ?? 0;
  const focus = event?.focus;
  const current = steps[index];
  const shown = new Set(current?.parts.map((p) => p.id));
  const narrow = layout === "narrow";

  // After Next / Back: the step heading; after a failed check or a refused submission: the first highlighted field.
  // Once per move (seq), never on other renders, so typing is never interrupted.
  useEffect(() => {
    if (!seq) return;
    if (focus === "message") {
      body.current?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    const invalid = focus === "invalid" ? fields.current?.querySelector<HTMLElement>('[data-shown] [aria-invalid="true"]') : null;
    const target = invalid ?? headings.current[index];
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per move: seq changes with every move
  }, [seq]);

  // Changed text is announced; the trailing no-break space alternates so the same message is announced again.
  const NBSP = String.fromCharCode(0xa0);
  const live = event && event.focus !== "message" ? `${(event.focus === "invalid" ? invalidAnnouncement : stepAnnouncement)(steps, index)}${event.seq % 2 ? NBSP : ""}` : "";
  const showIntro = !!intro && (!narrow || wizard.isFirst);

  const back = !wizard.isFirst && (
    <Button type="button" variant="secondary" onClick={wizard.back} disabled={submitting} className={narrow ? "flex-1" : "min-w-[120px]"} data-testid="wizard-back">
      Back
    </Button>
  );
  const next = (
    <Button
      type="submit"
      loading={submitting && wizard.isLast}
      className={narrow ? "flex-1" : "ml-auto min-w-[120px]"}
      onClick={(e) => {
        if (ignoreRepeatedClick(e.detail)) e.preventDefault();
      }}
      data-testid={wizard.isLast ? "wizard-submit" : "wizard-next"}
    >
      {wizard.isLast ? (submitting ? submittingLabel : submitLabel) : "Next"}
    </Button>
  );

  return (
    <div
      className="flex flex-col"
      data-testid="form-wizard"
      data-step={index + 1}
      data-layout={layout}
      onFocusCapture={(e) => wizard.setAnchor((e.target as HTMLElement).closest?.("[data-part]")?.getAttribute("data-part") ?? null)}
    >
      <div ref={body} className="space-y-2.5" data-testid="wizard-body">
        {/* The switch and the page heading: one row from 768px (the heading on the left), stacked on phones. */}
        {header && <div className="space-y-2.5 md:flex md:flex-row-reverse md:items-center md:justify-between md:gap-4 md:space-y-0 md:[&>nav]:w-80 md:[&>nav]:shrink-0">{header}</div>}
        {showIntro && intro}
        {notices}

        <ol aria-label={label} aria-describedby={`${id}-progress`} className="flex items-start" data-testid="wizard-steps">
          {steps.map((s, i) => {
            const status = stepStatus(i, index);
            return (
              <li key={s.id} aria-current={status === "current" ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1 text-center" data-status={status}>
                {i > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${i <= index ? "bg-[#2B2BB2]" : "bg-slate-200"}`} aria-hidden="true" />}
                <span className={`relative z-[1] ${CIRCLE[status]}`} aria-hidden="true">
                  {status === "complete" ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`hidden px-1 text-[11px] leading-tight wizard-wide:block ${status === "current" ? "font-semibold text-slate-900" : "text-slate-600"}`}>{s.title}</span>
                <span className="sr-only">
                  {s.title} ({STATUS_TEXT[status]})
                </span>
              </li>
            );
          })}
        </ol>

        <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="wizard-live">
          {live}
        </p>
      </div>

      {/* The shown step: its heading and "Step 2 of 5" on one row, then every part of every step in the form's order
          (only the shown step's are visible). */}
      <section aria-labelledby={`${id}-step-${index}`} className="mt-3" data-testid="wizard-step" data-step-id={current?.id}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {steps.map((s, i) => (
              <div key={s.id} hidden={i !== index} className="wizard-step" data-testid={`wizard-step-${s.id}`}>
                <h2
                  id={`${id}-step-${i}`}
                  ref={(el) => {
                    headings.current[i] = el;
                  }}
                  tabIndex={-1}
                  className="flex items-center gap-2 rounded text-sm font-bold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-[#2B2BB2]" aria-hidden="true">
                    {i + 1}
                  </span>
                  {s.title}
                </h2>
              </div>
            ))}
          </div>
          <p id={`${id}-progress`} className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-600" data-testid="wizard-progress">
            {progressLabel(index, steps.length)}
            {/* The title is the heading beside it: said, not shown twice. */}
            <span className="sr-only"> · {current?.title}</span>
          </p>
        </div>
        {current?.description && <p className="mt-0.5 text-xs text-slate-600">{current.description}</p>}
        <div ref={fields} className={`mt-2.5 grid grid-cols-1 gap-x-5 gap-y-3 wizard-wide:grid-cols-2 ${COMPACT_FIELDS}`} data-testid="wizard-fields">
          {/* In the form's order whatever the grouping, so a new grouping never moves a part (nor the focus out of it). */}
          {steps
            .flatMap((s) => s.parts)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((p) => {
              const content = parts[p.id];
              const visible = shown.has(p.id) && content != null && content !== false;
              return (
                <div key={p.id} hidden={!visible} data-part={p.id} data-shown={visible || undefined} className={`wizard-step min-w-0 ${p.wide ? "wizard-wide:col-span-2" : ""}`}>
                  {content}
                </div>
              );
            })}
        </div>
      </section>

      {narrow ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3" data-testid="wizard-actions">
          <div className="flex gap-3">
            {back}
            {next}
          </div>
          {footer}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 [&_p]:text-left" data-testid="wizard-actions">
          {back}
          {footer && <div className="min-w-0">{footer}</div>}
          {next}
        </div>
      )}
    </div>
  );
}
