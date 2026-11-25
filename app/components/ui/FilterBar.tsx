"use client";

/**
 * The list filter bar (owner 2026-11-25): filters are not all on screen. A search box, "+ Add filter" (with the number
 * of active filters) which lists the filters not in use, and the active ones as chips — click a chip to change its
 * value, × to remove it, "Clear all" to remove every one. The filters themselves (their values, the page address,
 * "act on every match", exports) work as before: the page keeps its own state and gives each filter's value and
 * onChange.
 *
 *  - "select": one value from a list (a quick search inside when the list is long);
 *  - "text": typed text (or a date, inputType "date"), applied with Enter or "Apply".
 * A filter with `show: false` is not offered (e.g. District until a Province is chosen); an active one is always shown.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ListFilter, Search, X } from "lucide-react";

export interface FilterOption { label: string; value: string }

interface FilterBase {
  /** Stable key (also used in test ids: filter-chip-<key>). */
  key: string;
  label: string;
  value: string;
  /** The value meaning "not filtered" (default ""). */
  emptyValue?: string;
  onChange: (value: string) => void;
  /** Offered in "+ Add filter" (default true). */
  show?: boolean;
}
export type FilterDef =
  | (FilterBase & { kind: "select"; options: FilterOption[] })
  | (FilterBase & { kind: "text"; placeholder?: string; hint?: ReactNode; /** "date" for a calendar date (YYYY-MM-DD); default "text". */ inputType?: "text" | "date" });

const isActive = (f: FilterDef) => f.value !== (f.emptyValue ?? "");
const valueLabel = (f: FilterDef) => (f.kind === "select" ? f.options.find((o) => o.value === f.value)?.label ?? f.value : f.value);

export function FilterBar({
  search, filters, onClearAll, testId = "filter-bar", trailing,
}: {
  /** The search box (usually <SearchInput />). */
  search?: ReactNode;
  filters: FilterDef[];
  /** Clears every filter (the page decides what stays, e.g. the sort). */
  onClearAll: () => void;
  testId?: string;
  /** Anything after the button on the same line (e.g. "Columns"). */
  trailing?: ReactNode;
}) {
  const active = filters.filter(isActive);
  const offered = filters.filter((f) => !isActive(f) && f.show !== false);
  // What is open: the "Add filter" menu, or one filter's value editor.
  const [open, setOpen] = useState<null | "menu" | string>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const editing = open && open !== "menu" ? filters.find((f) => f.key === open) : undefined;

  return (
    <div className="mb-4" data-testid={testId} ref={boxRef}>
      <div className="flex flex-wrap items-center gap-3">
        {search}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => (o === "menu" ? null : "menu"))}
            aria-haspopup="menu"
            aria-expanded={open === "menu"}
            aria-controls={open === "menu" ? menuId : undefined}
            disabled={offered.length === 0 && active.length === 0}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              active.length ? "border-[#00428C] bg-[#00428C]/[0.06] text-[#00428C]" : "border-slate-200 bg-white text-[#00428C] hover:bg-slate-50"
            }`}
            data-testid="filter-add"
          >
            <ListFilter className="h-4 w-4" aria-hidden="true" />
            Add filter
            {active.length > 0 && (
              <span className="rounded-full bg-[#00428C] px-1.5 text-[11px] font-bold leading-5 text-white" data-testid="filter-count">{active.length}</span>
            )}
          </button>
          {open === "menu" && (
            <div id={menuId} role="menu" aria-label="Filter by" className="absolute right-0 top-full z-40 mt-2 max-h-[60vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto sm:left-0 sm:right-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg" data-testid="filter-menu">
              <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Filter by</p>
              {offered.length === 0 ? (
                <p className="px-2.5 py-2 text-sm text-slate-600">Every filter is in use.</p>
              ) : offered.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="menuitem"
                  onClick={() => setOpen(f.key)}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
                  data-testid={`filter-option-${f.key}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {editing && <FilterEditor filter={editing} onDone={() => setOpen(null)} />}
        </div>
        {trailing}
      </div>

      {active.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="filter-chips">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active:</span>
          {active.map((f) => (
            <span key={f.key} className="inline-flex items-center rounded-full border border-[#00428C]/20 bg-[#00428C]/[0.06] text-sm" data-testid={`filter-chip-${f.key}`}>
              <button
                type="button"
                onClick={() => setOpen(f.key)}
                className="rounded-l-full py-1 pl-3 pr-1 text-slate-700 hover:underline"
                aria-label={`${f.label}: ${valueLabel(f)}. Change`}
              >
                {f.label}: <b className="font-semibold text-[#00428C]">{valueLabel(f)}</b>
              </button>
              <button
                type="button"
                onClick={() => { f.onChange(f.emptyValue ?? ""); setOpen(null); }}
                className="mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                aria-label={`Remove the filter ${f.label}`}
                data-testid={`filter-remove-${f.key}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => { setOpen(null); onClearAll(); }} className="ml-1 text-sm font-semibold text-[#00428C] underline-offset-2 hover:underline" data-testid="filter-clear-all">
            Clear all ({active.length})
          </button>
        </div>
      )}
    </div>
  );
}

/** One filter's values (a list, or a text box), under the "Add filter" button. */
function FilterEditor({ filter, onDone }: { filter: FilterDef; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [text, setText] = useState(filter.kind === "text" ? filter.value : "");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const options = useMemo(() => {
    if (filter.kind !== "select") return [];
    const empty = filter.emptyValue ?? "";
    const list = filter.options.filter((o) => o.value !== empty);
    const needle = q.trim().toLowerCase();
    return needle ? list.filter((o) => o.label.toLowerCase().includes(needle)) : list;
  }, [filter, q]);

  return (
    <div role="dialog" aria-label={`Filter by ${filter.label}`} className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl sm:left-0 sm:right-auto border border-slate-200 bg-white p-2 shadow-lg" data-testid={`filter-editor-${filter.key}`}>
      <p className="px-1.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{filter.label}</p>
      {filter.kind === "select" ? (
        <>
          {filter.options.length > 8 && (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                aria-label={`Search the ${filter.label} values`}
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-sm focus:border-[#00428C] focus:outline-none focus:ring-2 focus:ring-[#00428C]/15"
              />
            </div>
          )}
          <ul className="max-h-[50vh] overflow-y-auto" role="listbox" aria-label={filter.label}>
            {options.length === 0 && <li className="px-2 py-2 text-sm text-slate-600">No match.</li>}
            {options.map((o) => {
              const selected = o.value === filter.value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => { filter.onChange(o.value); onDone(); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 focus:bg-slate-100 focus:outline-none ${selected ? "font-semibold text-[#00428C]" : "text-slate-800"}`}
                  >
                    {o.label}
                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); filter.onChange(text.trim()); onDone(); }}
          className="space-y-2 px-1 pb-1"
        >
          <input
            ref={inputRef}
            type={filter.inputType ?? "text"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={filter.placeholder}
            aria-label={filter.label}
            maxLength={100}
            className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm focus:border-[#00428C] focus:outline-none focus:ring-2 focus:ring-[#00428C]/15"
          />
          {filter.hint && <div className="text-xs text-slate-600">{filter.hint}</div>}
          <div className="flex justify-end">
            <button type="submit" className="rounded-md bg-[#00428C] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#003574]">Apply</button>
          </div>
        </form>
      )}
    </div>
  );
}
