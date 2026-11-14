"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest("[inert]") && el.getClientRects().length > 0,
  );
}

/** Active traps, innermost last: only the innermost (e.g. a confirmation over a form dialog) handles Tab. */
const stack: HTMLElement[] = [];

/** The element a dialog should focus first: an explicit `data-autofocus`, then the first field, then the first control that is not the close button. */
function initialTarget(root: HTMLElement): HTMLElement {
  const explicit = root.querySelector<HTMLElement>("[data-autofocus]");
  if (explicit) return explicit;
  const all = focusables(root);
  const field = all.find((el) => el.matches("input, textarea, select"));
  if (field) return field;
  return all.find((el) => !el.hasAttribute("data-dialog-close")) ?? all[0] ?? root;
}

/**
 * Keyboard focus for a modal surface (dialog, mobile navigation drawer):
 * while `active`, focus moves into `ref`, Tab / Shift+Tab cycle inside it,
 * and when it deactivates (or unmounts) focus returns to the element that
 * had it before — or to `returnTo` when given. `onEscape`, when given, runs on
 * Escape while this is the innermost active trap.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  options: { returnTo?: RefObject<HTMLElement | null>; onEscape?: () => void } = {},
) {
  const returnTo = useRef(options.returnTo);
  const onEscape = useRef(options.onEscape);
  useEffect(() => {
    returnTo.current = options.returnTo;
    onEscape.current = options.onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stack.push(root);

    // Move focus in on the next frame (content of the same commit, CSS visibility and `inert`
    // changes applied). Chrome can refuse focus in the frame `inert` is removed: retry a few frames.
    let raf = 0;
    const focusIn = (triesLeft: number) => {
      raf = requestAnimationFrame(() => {
        if (root.contains(document.activeElement)) return;
        const target = initialTarget(root);
        if (target === root && !root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
        target.focus();
        if (document.activeElement !== target && triesLeft > 0) focusIn(triesLeft - 1);
      });
    };
    focusIn(10);

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== root) return;
      if (e.key === "Escape" && onEscape.current) {
        onEscape.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      const at = stack.lastIndexOf(root);
      if (at !== -1) stack.splice(at, 1);
      const back = returnTo.current?.current ?? previous;
      if (back && back.isConnected) back.focus();
    };
  }, [active, ref]);
}
