/**
 * Page frame and filter pills shared by the three portals (first written for
 * the admin portal; `adminUi.tsx` re-exports them as `AdminPage` and
 * `FilterPills`).
 *
 * Academic Prestige: a slate canvas, an editorial header (optional amber eyebrow, a Newsreader title at calibrated
 * size, a muted description) closed by a hairline rule, then the page content.
 */
import type { ReactNode } from "react";

/** Page background, padding and title row. `eyebrow`: an optional small uppercase label above the title. */
export function PageFrame({
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10 text-gray-800 font-sans">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div className="min-w-0">
          {eyebrow && <span className="eyebrow mb-1.5">{eyebrow}</span>}
          <h1 className="text-[1.75rem] leading-tight sm:text-[2rem] sm:leading-[2.5rem] text-brand">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function FilterPills<T extends string>({ options, value, onChange, label = "Filter" }: { options: { label: string; value: T; count?: number }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${active ? "bg-brand text-white border-brand" : "bg-white text-gray-600 border-line hover:border-brand-600 hover:text-brand"}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`ml-1.5 tabular-nums ${active ? "text-brand-200" : "text-gray-500"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
