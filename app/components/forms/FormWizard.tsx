"use client";

/**
 * A long form shown one step at a time (Student, Teacher and Coach registration). The form keeps its own state, rules,
 * request and error mapping; this only shows one step, the progress, Back / Next and the form's own submit button on the
 * last step. Rules: lib/forms/wizard.ts (unit-tested in tests/form-wizard.test.mjs).
 *
 * - Every step stays mounted (only the shown one is visible), so nothing typed or chosen is lost moving back and forth.
 * - The submit button reads "Next" before the last step: the form's submit handler checks the shown step with the form's
 *   own validation and moves on (useFormWizard → next), or sends the form on the last step. Enter in a one-line field
 *   therefore moves to the next step and never sends early; a text area keeps Enter for new lines.
 * - Focus moves to the step heading after Next / Back, or to the first highlighted field when a step has errors; a live
 *   region announces the step ("Step 2 of 4: Your studies") and its errors. The progress list marks the shown step with
 *   aria-current="step".
 * - The card fits the window: the form (WIZARD_FORM_CLASS) is at most the window's height. Back / Next (and the form's
 *   footer) stay at the bottom of the card; the form's header and the step scroll inside the card, with the progress kept
 *   in view at the top, so the page itself does not scroll.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/app/components/ui/form";
import {
  clampStep,
  ignoreRepeatedClick,
  invalidAnnouncement,
  progressLabel,
  stepAnnouncement,
  stepStatus,
  wizardReducer,
  INITIAL_WIZARD,
  type WizardAction,
  type WizardState,
  type WizardStepModel,
} from "@/lib/forms/wizard";

/** One step: its title, the error keys of its fields (lib/forms/wizard) and its fields. */
export interface WizardStep extends WizardStepModel {
  description?: string;
  content: ReactNode;
}

/**
 * Classes for the <form> holding a wizard: at most the window's height less what the page puts around the card (the brand
 * bar on phones and tablets, the page padding, the card padding and the footer), so the card never makes the page scroll.
 */
export const WIZARD_FORM_CLASS =
  "flex flex-col max-h-[max(18rem,calc(100dvh-15rem))] sm:max-h-[max(18rem,calc(100dvh-18.5rem))] lg:max-h-[max(18rem,calc(100dvh-14.5rem))]";

/** Which step is shown, and what happened last (so the wizard moves focus and announces it). Rules: wizardReducer. */
export function useFormWizard(count: number) {
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD);
  const index = clampStep(state.index, count);
  const go = (a: WizardAction) => setState((s) => wizardReducer(count, s, a));
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
    /** A refusal that names no field: its message (above the steps) is scrolled into view; its alert announces it. */
    showMessage: () => go({ type: "message" }),
  };
}

export type FormWizardState = ReturnType<typeof useFormWizard>;

const circle = "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors";
const CIRCLE = {
  complete: `${circle} bg-[#2B2BB2] text-white`,
  current: `${circle} bg-indigo-50 text-[#2B2BB2] ring-2 ring-[#2B2BB2]`,
  upcoming: `${circle} bg-white text-slate-600 ring-1 ring-slate-300`,
} as const;
const STATUS_TEXT = { complete: "completed", current: "current step", upcoming: "not started" } as const;

export default function FormWizard({
  wizard,
  steps,
  submitLabel,
  submittingLabel,
  submitting = false,
  header,
  footer,
  label = "Registration steps",
}: {
  wizard: FormWizardState;
  steps: readonly WizardStep[];
  submitLabel: string;
  submittingLabel: string;
  submitting?: boolean;
  /** Above the steps, scrolling with them (the switch, the page heading, messages). */
  header?: ReactNode;
  /** Under Back / Next, always in view (e.g. "Already have an account? Sign in"). */
  footer?: ReactNode;
  label?: string;
}) {
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const { index, event } = wizard;
  const seq = event?.seq ?? 0;
  const focus = event?.focus;

  // After Next / Back: the step heading; after a failed check or a refused submission: the first highlighted field.
  // Once per move (seq), never on other renders, so typing is never interrupted.
  useEffect(() => {
    if (!seq) return;
    if (focus === "message") {
      body.current?.scrollTo?.({ top: 0 });
      return;
    }
    const invalid = focus === "invalid" ? panels.current[index]?.querySelector<HTMLElement>('[aria-invalid="true"]') : null;
    const target = invalid ?? headings.current[index];
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: invalid ? "center" : "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per move: seq changes with every move
  }, [seq]);

  // Changed text is announced; the trailing no-break space alternates so the same message is announced again.
  const NBSP = String.fromCharCode(0xa0);
  const live = event && event.focus !== "message" ? `${(event.focus === "invalid" ? invalidAnnouncement : stepAnnouncement)(steps, index)}${event.seq % 2 ? NBSP : ""}` : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="form-wizard" data-step={index + 1}>
      <div ref={body} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1" data-testid="wizard-body">
        {header && <div className="space-y-5 pb-5">{header}</div>}

        {/* The progress stays in view while the step's fields scroll under it. */}
        <div className="sticky top-0 z-10 space-y-3 bg-white pb-4" data-testid="wizard-progress-bar">
          <p id={`${id}-progress`} className="text-xs font-semibold uppercase tracking-wider text-slate-600" data-testid="wizard-progress">
            {progressLabel(index, steps.length)}
            <span className="font-medium normal-case tracking-normal"> · {steps[index]?.title}</span>
          </p>
          <ol aria-label={label} aria-describedby={`${id}-progress`} className="flex items-start" data-testid="wizard-steps">
            {steps.map((s, i) => {
              const status = stepStatus(i, index);
              return (
                <li key={s.id} aria-current={status === "current" ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1.5 text-center" data-status={status}>
                  {i > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 ${i <= index ? "bg-[#2B2BB2]" : "bg-slate-200"}`} aria-hidden="true" />}
                  <span className={`relative z-[1] ${CIRCLE[status]}`} aria-hidden="true">
                    {status === "complete" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={`hidden px-1 text-[11px] leading-tight sm:block ${status === "current" ? "font-semibold text-slate-900" : "text-slate-600"}`}>{s.title}</span>
                  <span className="sr-only">
                    {s.title} ({STATUS_TEXT[status]})
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="wizard-live">
          {live}
        </p>

        {steps.map((s, i) => (
          <section
            key={s.id}
            ref={(el) => {
              panels.current[i] = el;
            }}
            hidden={i !== index}
            aria-labelledby={`${id}-step-${i}`}
            className="wizard-step space-y-4 pt-1"
            data-testid={`wizard-step-${s.id}`}
          >
            <h2
              id={`${id}-step-${i}`}
              ref={(el) => {
                headings.current[i] = el;
              }}
              tabIndex={-1}
              className="flex scroll-mt-28 items-center gap-2 rounded text-sm font-bold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-[#2B2BB2]" aria-hidden="true">
                {i + 1}
              </span>
              {s.title}
            </h2>
            {s.description && <p className="-mt-2 text-xs text-slate-600">{s.description}</p>}
            {s.content}
          </section>
        ))}
      </div>

      <div className="flex shrink-0 gap-3 border-t border-slate-100 pt-4">
        {!wizard.isFirst && (
          <Button type="button" variant="secondary" onClick={wizard.back} disabled={submitting} data-testid="wizard-back">
            Back
          </Button>
        )}
        <Button
          type="submit"
          loading={submitting && wizard.isLast}
          className="flex-1"
          onClick={(e) => {
            if (ignoreRepeatedClick(e.detail)) e.preventDefault();
          }}
          data-testid={wizard.isLast ? "wizard-submit" : "wizard-next"}
        >
          {wizard.isLast ? (submitting ? submittingLabel : submitLabel) : "Next"}
        </Button>
      </div>
      {footer && <div className="shrink-0 pt-4">{footer}</div>}
    </div>
  );
}
