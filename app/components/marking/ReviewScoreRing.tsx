/**
 * The Head Coach review's total score ring (design 3): an SVG arc of total / maximum with the numbers beside it. The
 * ring is decorative; screen readers get "Total: 26 of 28 marks (93%)" (or "not marked yet").
 */
export function ReviewScoreRing({ total, max, caption }: { total: number | null; max: number; caption?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = total != null && max > 0 ? Math.max(0, Math.min(1, total / max)) : 0;
  const label = total == null ? "Total: not marked yet" : `Total: ${total} of ${max} marks (${Math.round(pct * 100)}%)`;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3" role="img" aria-label={caption ? `${label}, ${caption}` : label} data-testid="review-score">
      <svg viewBox="0 0 44 44" className="h-12 w-12 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-slate-200" />
        {total != null && (
          <circle
            cx="22" cy="22" r={r} fill="none" strokeWidth="5" strokeLinecap="round"
            className="stroke-[#00428C] transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          />
        )}
      </svg>
      <div aria-hidden="true">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Total</p>
        <p className="whitespace-nowrap text-slate-900">
          <span className="text-2xl font-bold tabular-nums">{total ?? "—"}</span>
          <span className="text-sm text-slate-600"> / {max}</span>
        </p>
        {caption && <p className="text-xs text-slate-600">{caption}</p>}
      </div>
    </div>
  );
}
