"use client";

/**
 * The registration forms (Student, Teacher, Coach) as ONE continuous form: the page heading, the fields in their natural
 * order (lib/forms/registration-fields) and one submit button. No steps, no section headings, no progress, no Next / Back.
 * The form keeps its own state, rules, request and error mapping; this only lays the fields out and moves focus.
 *
 * - Two columns above 640px where fields pair naturally (first / last name, district / sector …), one column on phones.
 *   A `wide` part spans both columns; a `row` part starts a new row.
 * - A failed check or a field the server refuses: focus goes to the first highlighted field (in the page's order) and a
 *   live region says "Please check the highlighted fields."; a refusal naming no field brings its message (above the
 *   fields) into view, where its alert announces it.
 * - The submit button is the only button: full width, under the last field; the second click of a double click is
 *   ignored (lib/forms/wizard → ignoreRepeatedClick), so a double click never sends the form twice.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/app/components/ui/form";
import { ignoreRepeatedClick } from "@/lib/forms/wizard";
import type { SignupPart } from "@/lib/forms/registration-fields";

/** Classes for the <form> holding a SignupForm. */
export const SIGNUP_FORM_CLASS = "flex flex-col";

type FocusEvent = { seq: number; focus: "invalid" | "message" };

/** Where focus goes after a submission: the first highlighted field, or the form's message. */
export function useSignupFocus() {
  const [event, setEvent] = useState<FocusEvent | null>(null);
  const go = (focus: FocusEvent["focus"]) => setEvent((s) => ({ seq: (s?.seq ?? 0) + 1, focus }));
  return {
    event,
    /** Errors are shown: focus moves to the first highlighted field. */
    showErrors: () => go("invalid"),
    /** A refusal that names no field: its message (above the fields) is brought into view. */
    showMessage: () => go("message"),
  };
}

export type SignupFocus = ReturnType<typeof useSignupFocus>;

/**
 * The fields: 44px inputs and dropdowns with rounded corners, dark labels, hints and errors close to their field; 16px
 * text in fields on phones (no zoom on iOS), 14px on wider windows.
 */
const FIELD_STYLE = [
  "[&_label.block]:mb-1.5 [&_label.block]:text-slate-800 [&_legend]:mb-1.5 [&_legend]:text-slate-800",
  "[&_select]:h-11 [&_select]:rounded-xl [&_textarea]:rounded-xl [&_textarea]:py-2.5",
  "[&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:h-11 [&_input:not([type=checkbox]):not([type=radio]):not([type=file])]:rounded-xl",
  "[&_[id$=-hint]]:mt-1 [&_[id$=-error]]:mt-1",
  "[&_input]:text-base [&_select]:text-base [&_textarea]:text-base sm:[&_input]:text-sm sm:[&_select]:text-sm sm:[&_textarea]:text-sm",
  // The chosen school's details: two columns on phones, three on wider windows.
  "[&_[data-testid=school-facts]]:grid-cols-2 [&_[data-testid=school-facts]]:gap-y-1 [&_[data-testid=school-facts]]:py-2 sm:[&_[data-testid=school-facts]]:grid-cols-3",
].join(" ");

export default function SignupForm({
  focus,
  parts,
  content,
  submitLabel,
  submittingLabel,
  submitting = false,
  header,
  intro,
  notices,
  footer,
}: {
  focus: SignupFocus;
  /** The parts this form shows, in order (lib/forms/registration-fields). */
  parts: readonly SignupPart[];
  /** The content of each part, by part id (nothing for a part that does not apply). */
  content: Readonly<Record<string, ReactNode>>;
  submitLabel: string;
  submittingLabel: string;
  submitting?: boolean;
  /** The page heading and the Student / Teacher / Coach switch. */
  header?: ReactNode;
  /** A short explanation under the heading. */
  intro?: ReactNode;
  /** Messages above the fields (a refused submission, the administrators' instructions). */
  notices?: ReactNode;
  /** Under the submit button, e.g. "Already have an account? Sign in". */
  footer?: ReactNode;
}) {
  const top = useRef<HTMLDivElement>(null);
  const fields = useRef<HTMLDivElement>(null);
  const seq = focus.event?.seq ?? 0;
  const kind = focus.event?.focus;

  // Once per submission (seq), never on other renders, so typing is never interrupted.
  useEffect(() => {
    if (!seq) return;
    const invalid = kind === "invalid" ? fields.current?.querySelector<HTMLElement>('[aria-invalid="true"]') : null;
    if (invalid) {
      invalid.focus({ preventScroll: true });
      invalid.scrollIntoView?.({ block: "center" });
      return;
    }
    top.current?.scrollIntoView?.({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per submission: seq changes with every one
  }, [seq]);

  // Changed text is announced; the trailing no-break space alternates so the same message is announced again.
  const NBSP = String.fromCharCode(0xa0);
  const live = kind === "invalid" ? `Please check the highlighted fields.${seq % 2 ? NBSP : ""}` : "";

  return (
    <div className="flex flex-col" data-testid="signup-form">
      <div ref={top} className="scroll-mt-4 space-y-4" data-testid="signup-top">
        {header}
        {intro}
        {notices}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="signup-live">
        {live}
      </p>

      <div ref={fields} className={`mt-6 grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 ${FIELD_STYLE}`} data-testid="signup-fields">
        {parts.map((p) => {
          const c = content[p.id];
          if (c == null || c === false) return null;
          return (
            <div key={p.id} data-part={p.id} className={`min-w-0 empty:hidden ${p.wide ? "sm:col-span-2" : p.row ? "sm:col-start-1" : ""}`}>
              {c}
            </div>
          );
        })}
      </div>

      <div className="mt-8 space-y-5" data-testid="signup-actions">
        <Button
          type="submit"
          variant="brand"
          loading={submitting}
          className="h-12 w-full rounded-xl text-[15px]"
          onClick={(e) => {
            if (ignoreRepeatedClick(e.detail)) e.preventDefault();
          }}
          data-testid="signup-submit"
        >
          {submitting ? submittingLabel : submitLabel}
        </Button>
        {footer}
      </div>
    </div>
  );
}
