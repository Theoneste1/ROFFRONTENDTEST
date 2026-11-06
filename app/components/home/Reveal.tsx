"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(rootMargin = "0px 0px -10% 0px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}

/**
 * Fades content up when it first scrolls into view (no motion with
 * reduced-motion; see globals.css). Delays are Tailwind classes, not inline
 * styles: the page is server-rendered and the CSP blocks inline style attributes.
 */
export default function Reveal({ as: Tag = "div", className = "", children, delayClass = "" }: { as?: ElementType; className?: string; children: ReactNode; delayClass?: string }) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <Tag ref={ref} className={`home-reveal ${inView ? "is-visible" : ""} ${delayClass} ${className}`}>
      {children}
    </Tag>
  );
}
