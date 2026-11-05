"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StudentAssignment } from "@/lib/api/types";
import { useNow } from "@/lib/hooks/useNow";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const monthFmt = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Month calendar (original widget design) marking assignment deadlines:
 * blue = open, red = due within 3 days and not yet submitted.
 */
export default function DeadlineCalendar({ assignments }: { assignments: StudentAssignment[] }) {
  const now = useNow();
  const today = new Date(now);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const deadlines = useMemo(() => {
    const map = new Map<string, { urgent: boolean; titles: string[] }>();
    for (const a of assignments) {
      const d = new Date(a.deadline);
      const key = dayKey(d);
      const msLeft = d.getTime() - now;
      const urgent = a.canSubmit && msLeft > 0 && msLeft < 3 * 86_400_000;
      const entry = map.get(key) ?? { urgent: false, titles: [] };
      entry.urgent ||= urgent;
      entry.titles.push(a.title);
      map.set(key, entry);
    }
    return map;
  }, [assignments, now]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  // Drop a trailing week that belongs entirely to the next month.
  const visible = cells.slice(0, cells[35].getMonth() !== cursor.getMonth() ? 35 : 42);

  return (
    <div className="bg-[#f3f4f9] p-6 rounded-3xl border border-slate-100 shadow-sm relative">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="p-1 rounded hover:bg-white/60"
        >
          <ChevronLeft className="w-4 h-4 text-slate-500 hover:text-slate-800" />
        </button>
        <span className="text-sm font-bold text-slate-800">{monthFmt.format(cursor)}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          aria-label="Next month"
          className="p-1 rounded hover:bg-white/60"
        >
          <ChevronRight className="w-4 h-4 text-slate-500 hover:text-slate-800" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400 mb-3">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 text-center text-xs gap-y-3 font-medium text-slate-600">
        {visible.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = dayKey(d) === dayKey(today);
          const mark = deadlines.get(dayKey(d));
          return (
            <span
              key={d.toISOString()}
              title={mark ? `Due: ${mark.titles.join(", ")}` : undefined}
              className={
                isToday
                  ? "bg-[#03045e] text-white rounded-xl w-7 h-7 flex items-center justify-center mx-auto text-xs font-bold shadow-md relative"
                  : `relative ${inMonth ? "" : "text-slate-300"}`
              }
            >
              {d.getDate()}
              {mark && (
                <span
                  className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${mark.urgent ? "bg-red-500" : "bg-blue-500"}`}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Deadline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Due soon
        </span>
      </div>
    </div>
  );
}
