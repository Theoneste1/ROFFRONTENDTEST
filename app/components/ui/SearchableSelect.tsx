"use client";

/**
 * A searchable dropdown (ARIA combobox with a list box): type to filter, ↑ / ↓ to move, Enter to choose, Escape to close.
 * Used for long lists such as the home country (lib/accounts/home-location). The text box shows the chosen option; what
 * is typed only filters — the value changes only when an option is chosen (or the typed text names one exactly when the
 * box is left). The first invalid field of a form takes focus through aria-invalid, as with the other controls.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface SearchableOption {
  value: string;
  label: string;
}

/** Lower case, without accents: "Côte d'Ivoire" is found by "cote". */
export const searchKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** The options matching a query: those starting with it first, then those containing it, each in the list's order. */
export function filterOptions<T extends SearchableOption>(options: readonly T[], query: string): T[] {
  const q = searchKey(query);
  if (!q) return [...options];
  const starts: T[] = [];
  const contains: T[] = [];
  for (const o of options) {
    const k = searchKey(o.label);
    if (k.startsWith(q)) starts.push(o);
    else if (k.includes(q) || o.value.toLowerCase() === q) contains.push(o);
  }
  return [...starts, ...contains];
}

export default function SearchableSelect({
  label, value, onChange, options, placeholder = "Type to search", error, hint, required = true, disabled, testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableOption[];
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState<string | null>(null);   // null: not searching (the box shows the chosen option)
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = query !== null;
  const shown = useMemo(() => (open ? filterOptions(options, query) : []), [open, options, query]);

  // An option chosen (even the current one: a deliberate choice, e.g. a home country confirmed by the person).
  const choose = (o: SearchableOption | undefined) => {
    setQuery(null);
    if (o) onChange(o.value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setQuery("");
        setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        return;
      }
      const n = shown.length;
      if (n) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        choose(shown[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setQuery(null);
      }
    }
  };
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const activeId = open && shown[active] ? `${id}-opt-${shown[active].value}` : undefined;

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-slate-700">
        {label} {required && <span className="text-amber-600">*</span>}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          disabled={disabled}
          placeholder={selected ? undefined : placeholder}
          value={open ? query : selected?.label ?? ""}
          onFocus={() => {
            setQuery("");
            setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Leaving the box: an exact name chooses that option; anything else keeps the previous choice.
            const typed = query === null ? "" : searchKey(query);
            const match = typed ? options.find((o) => searchKey(o.label) === typed) : undefined;
            choose(match && match.value !== value ? match : undefined);
          }}
          className={`w-full rounded-lg border bg-white py-3 pl-4 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-500 ${
            error ? "border-red-400 focus:ring-red-500/20" : "border-slate-300 focus:border-brand focus:ring-brand/20"
          }`}
          data-testid={testId}
          data-value={value}
        />
        <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
        </svg>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
          data-testid={testId ? `${testId}-options` : undefined}
        >
          {shown.length === 0 ? (
            <li className="px-4 py-2 text-slate-500">No match</li>
          ) : (
            shown.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-opt-${o.value}`}
                role="option"
                aria-selected={o.value === value}
                // Chosen on mouse down, before the box loses focus.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                  inputRef.current?.blur();
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-4 py-2 ${i === active ? "bg-brand/10 text-brand" : "text-slate-700"} ${o.value === value ? "font-semibold" : ""}`}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}
