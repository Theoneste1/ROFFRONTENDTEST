"use client";

/** Prev / Next pager in the style of the original leaderboard pager. */
export default function Pagination({
  page,
  totalPages,
  total,
  onPage,
  disabled,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  const btn =
    "px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 bg-white/50 hover:bg-white rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <nav className="flex items-center justify-end gap-2 mt-4 px-2" aria-label="Pagination">
      <span className="text-xs text-slate-500 mr-2">
        Page {page} of {totalPages}
        {total !== undefined && ` · ${total} total`}
      </span>
      <button type="button" className={btn} disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <button type="button" className={btn} disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}
