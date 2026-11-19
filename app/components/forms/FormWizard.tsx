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
 *   region announces the step ("Step 2 of 4: Your studies") and its errors.
 * - The progress indicator (the approved reference design) shows the form's named phases: numbered circles joined by
 *   lines, the shown phase filled and marked aria-current="step", completed phases with a check mark. A phase that runs
 *   over several steps (screens) says where the person is inside it ("2 of 3") beside the step heading.
 * - Cancel (first step: back to the home page) or Back on the left, Next / submit on the right: never stretched on the
 *   wide layout, side by side on phones; under them, between two thin lines, the footer ("Already have an account?").
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Check, GraduationCap, House, KeyRound, ListChecks, Presentation, School, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "@/app/components/ui/form";
import {
  clampStep,
  ignoreRepeatedClick,
  invalidAnnouncement,
  phaseOfStep,
  phasesOf,
  phaseStatus,
  progressLabel,
  remapStep,
  screenLabel,
  stepAnnouncement,
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

const circle = "relative z-[1] flex flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors h-7 w-7 wizard-wide:h-8 wizard-wide:w-8 wizard-wide:text-sm";
const CIRCLE = {
  complete: `${circle} bg-brand text-white`,
  current: `${circle} bg-brand text-white ring-4 ring-brand/15`,
  upcoming: `${circle} bg-white text-slate-700 ring-1 ring-slate-300`,
} as const;
const STATUS_TEXT = { complete: "completed", current: "current step", upcoming: "not started" } as const;

/** The icon beside a step heading, by phase (lib/forms/registration-steps). */
const PHASE_ICONS: Record<string, LucideIcon> = {
  about: UserRound,
  studies: GraduationCap,
  home: House,
  teaching: Presentation,
  school: School,
  background: BriefcaseBusiness,
  account: KeyRound,
};

/**
 * The fields inside the wizard (the shared inputs keep their look elsewhere): 44px inputs and dropdowns with light
 * borders and rounded corners, dark labels, hints and errors close to their field. Text stays 14px.
 */
const FIELD_STYLE = [
  "[&_label.block]:mb-1.5 [&_label.block]:text-slate-800 [&_legend]:mb-1.5 [&_legend]:text-slate-800",
  "[&_select]:h-11 [&_select]:rounded-lg [&_textarea]:py-2 [&_textarea]:rounded-lg",
  "[&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:h-11 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:rounded-lg",
  "[&_[id$=-hint]]:mt-1 [&_[id$=-error]]:mt-1",
  // 16px text in fields on phones (no zoom on iOS), 14px on the wide layout.
  "[&_input]:text-base [&_select]:text-base [&_textarea]:text-base wizard-wide:[&_input]:text-sm wizard-wide:[&_select]:text-sm wizard-wide:[&_textarea]:text-sm",
  // The chosen school's details: two columns on phones, three on the wide layout.
  "[&_[data-testid=school-facts]]:grid-cols-2 [&_[data-testid=school-facts]]:gap-y-1 [&_[data-testid=school-facts]]:py-2 wizard-wide:[&_[data-testid=school-facts]]:grid-cols-3",
].join(" ");

/** Cancel / Back: outlined; Next / submit: solid blue (Button keeps both disabled until the page is interactive). */
const ACTION = "h-11 rounded-lg px-6 text-sm font-semibold";

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
  cancelHref = "/",
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
  /** Under the progress (the page heading, the Student / Teacher / Coach switch). */
  header?: ReactNode;
  /** The page's explanation under the heading: on every step of the wide layout, on the first step on phones. */
  intro?: ReactNode;
  /** Messages above the steps (a refused submission, the administrators' instructions): always shown. */
  notices?: ReactNode;
  /** Under Back / Next, between two thin lines, e.g. "Already have an account? Sign in". */
  footer?: ReactNode;
  /** Where Cancel (on the first step) goes. */
  cancelHref?: string;
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
  const phases = phasesOf(steps);
  const phaseAt = phaseOfStep(phases, index);
  const screen = screenLabel(phases, index);

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
  const size = narrow ? "flex-1" : "min-w-[120px]";

  const back = wizard.isFirst ? (
    <Link
      href={cancelHref}
      className={`${ACTION} ${size} inline-flex items-center justify-center border border-slate-400 bg-white text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2`}
      data-testid="wizard-cancel"
    >
      Cancel
    </Link>
  ) : (
    <Button type="button" variant="outline" onClick={wizard.back} disabled={submitting} className={`${ACTION} ${size}`} data-testid="wizard-back">
      Back
    </Button>
  );
  const next = (
    <Button
      type="submit"
      variant="brand"
      loading={submitting && wizard.isLast}
      className={`${ACTION} ${narrow ? "flex-1" : "ml-auto min-w-[120px]"}`}
      onClick={(e) => {
        if (ignoreRepeatedClick(e.detail)) e.preventDefault();
      }}
      data-testid={wizard.isLast ? "wizard-submit" : "wizard-next"}
    >
      {wizard.isLast ? (submitting ? submittingLabel : submitLabel) : "Next"}
      {!wizard.isLast && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
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
      <div ref={body} className="space-y-3 wizard-wide:space-y-4" data-testid="wizard-body">
        {/* The phases: numbered circles joined by lines, each named under its circle. */}
        <ol aria-label={label} aria-describedby={`${id}-progress`} className="flex items-start" data-testid="wizard-steps">
          {phases.map((p, i) => {
            const status = phaseStatus(phases, i, index);
            return (
              <li key={p.id} aria-current={status === "current" ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1 text-center" data-status={status} data-phase={p.id}>
                {i > 0 && <span className={`absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2 wizard-wide:top-4 ${i <= phaseAt ? "bg-brand" : "bg-slate-200"}`} aria-hidden="true" />}
                <span className={CIRCLE[status]} aria-hidden="true">
                  {status === "complete" ? <Check className="h-3.5 w-3.5 wizard-wide:h-4 wizard-wide:w-4" strokeWidth={3} /> : i + 1}
                </span>
                <span className={`px-1 text-[11px] leading-tight wizard-wide:text-[13px] ${status === "current" ? "font-semibold text-slate-900" : "text-slate-600"}`} aria-hidden="true" data-testid="wizard-phase-label">
                  {p.title}
                </span>
                <span className="sr-only">
                  {p.title} ({STATUS_TEXT[status]})
                </span>
              </li>
            );
          })}
        </ol>

        {/* The page heading on the left, the Student / Teacher / Coach switch on the right (stacked on phones, and there
            only on the first step, like the explanation: every step must fit the window). */}
        {header && (
          <div className={`${narrow && !wizard.isFirst ? "[&>nav]:hidden " : ""}space-y-2 wizard-wide:flex wizard-wide:flex-row-reverse wizard-wide:items-start wizard-wide:justify-between wizard-wide:gap-4 wizard-wide:space-y-0 wizard-wide:[&>nav]:shrink-0`}>
            {header}
          </div>
        )}
        {showIntro && <div className="-mt-1 wizard-wide:-mt-2">{intro}</div>}
        {notices}
      </div>

      {/* Outside the spaced block above: it takes no room. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="wizard-live">
        {live}
      </p>

      {/* The shown step under a thin line: its heading and, in a phase of several steps, "2 of 3"; then every part of
          every step in the form's order (only the shown step's are visible). */}
      <section aria-labelledby={`${id}-step-${index}`} className="mt-3 border-t border-slate-200 pt-3 wizard-wide:mt-4 wizard-wide:pt-4" data-testid="wizard-step" data-step-id={current?.id}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {steps.map((s, i) => {
              const Icon = (s.phase && PHASE_ICONS[s.phase.id]) || ListChecks;
              return (
                <div key={s.id} hidden={i !== index} className="wizard-step" data-testid={`wizard-step-${s.id}`}>
                  <h2
                    id={`${id}-step-${i}`}
                    ref={(el) => {
                      headings.current[i] = el;
                    }}
                    tabIndex={-1}
                    className="flex items-center gap-2 rounded text-[15px] font-bold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0 text-brand" aria-hidden="true" />
                    {s.title}
                  </h2>
                </div>
              );
            })}
          </div>
          {/* "2 of 3" inside the phase (shown); the whole progress and the step's title are said. */}
          <p id={`${id}-progress`} className="flex min-h-6 min-w-12 shrink-0 items-center justify-end" data-testid="wizard-progress">
            {screen && (
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand" aria-hidden="true" data-testid="wizard-screen">
                {screen}
              </span>
            )}
            <span className="sr-only">
              {progressLabel(index, steps.length)} · {current?.title}
            </span>
          </p>
        </div>
        {current?.description && <p className="mt-0.5 text-xs text-slate-600">{current.description}</p>}
        <div ref={fields} className={`mt-3 grid grid-cols-1 gap-x-6 gap-y-3 wizard-wide:grid-cols-2 wizard-wide:gap-y-4 ${FIELD_STYLE}`} data-testid="wizard-fields">
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

      <div className="mt-3 space-y-3 wizard-wide:mt-5" data-testid="wizard-actions">
        <div className="flex items-center gap-3">
          {back}
          {next}
        </div>
        {footer && (
          <div className="flex items-center gap-3 [&_p]:text-center">
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            {footer}
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
