import type { ReactNode } from "react";

/** A titled white card on the profile page. */
export function Section({ title, icon, description, children }: { title: string; icon: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
