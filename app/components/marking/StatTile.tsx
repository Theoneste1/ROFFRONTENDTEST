/**
 * A compact statistic for the marking dashboards: a label, the number, a short hint. `tone` colours the number only;
 * `emphasis` makes it the one prominent tile of a row (logo blue), with an optional action link. Not every statistic
 * is equally prominent (owner 2026-11-26).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { MarkingTone } from "@/lib/test-management/marking-status";

const NUMBER: Record<MarkingTone, string> = {
  neutral: "text-gray-900", blue: "text-blue-800", indigo: "text-indigo-800", amber: "text-amber-800", green: "text-emerald-700", red: "text-red-700",
};

export function StatTile({
  label, value, hint, tone = "neutral", emphasis = false, action, testId, children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MarkingTone;
  emphasis?: boolean;
  /** The emphasised tile's call to action. */
  action?: { href: string; label: string };
  testId?: string;
  /** Extra content under the number (e.g. a progress bar). */
  children?: ReactNode;
}) {
  if (emphasis) {
    return (
      <div className="flex flex-col justify-between gap-2 rounded-xl bg-[#00428C] p-5 text-white shadow-sm" data-testid={testId}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">{label}</p>
        <div className="flex items-end justify-between gap-3">
          <span className="text-4xl font-bold leading-none tabular-nums" data-testid="tile-value">{value}</span>
          {action && (
            <Link href={action.href} className="inline-flex min-h-10 items-center rounded-lg bg-white/15 px-3 text-sm font-semibold hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
              {action.label} <span aria-hidden="true" className="ml-1">→</span>
            </Link>
          )}
        </div>
        {hint && <p className="text-xs text-blue-100">{hint}</p>}
      </div>
    );
  }
  return (
    <div className={`flex flex-col justify-between gap-1 rounded-xl border bg-white p-5 shadow-sm ${tone === "red" ? "border-red-200" : "border-gray-100"}`} data-testid={testId}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold tabular-nums ${NUMBER[tone]}`} data-testid="tile-value">{value}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** A thin progress bar with its text (screen readers get the numbers). */
export function ProgressBar({ value, total, tone = "blue" }: { value: number; total: number; tone?: "blue" | "green" | "amber" }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const fill = tone === "green" || (total > 0 && value >= total) ? "bg-emerald-600" : tone === "amber" ? "bg-amber-500" : "bg-[#00428C]";
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${value} of ${total} (${pct}%)`}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${fill} transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-600">{value} / {total}</span>
    </div>
  );
}
