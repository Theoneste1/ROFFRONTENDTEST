/**
 * Page frame and filter pills shared by the three portals (first written for
 * the admin portal; `adminUi.tsx` re-exports them as `AdminPage` and
 * `FilterPills`).
 */
import type { ReactNode } from "react";

/** Page background, padding and title row, as on the existing portal pages. */
export function PageFrame({ title, description, actions, children }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
          {description && <p className="text-sm text-gray-500 mt-1 font-medium">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
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
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${active ? "bg-indigo-600 text-white shadow-xs" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`ml-1.5 ${active ? "text-indigo-100" : "text-gray-400"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
