"use client";

/**
 * Assign a coach many courses at once (capability adminDivisions): All courses, All <division> courses (one option per
 * active division), or chosen courses in chosen divisions. Preview first — what is new, restored, already assigned or
 * not offered — then confirm. Nothing is duplicated.
 */
import { useState } from "react";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { BulkAssignmentResult } from "@/lib/api/admin";
import { courseAccessError } from "@/lib/programmes/programme-rules";
import { PAIR_STATE_TEXT, bulkAssignChanges, bulkAssignInput, bulkAssignSummary } from "@/lib/programmes/bulk-assign";
import { activeDivisions } from "@/lib/divisions/divisions";
import { useBulkAssign, useDivisions } from "@/lib/queries/divisions";
import { useCourses } from "@/lib/queries/learning";
import { Alert, Spinner } from "@/app/components/ui/feedback";
import { btnPrimary, btnSecondary } from "../../components/adminUi";

const changeError = (e: unknown) => (isApiError(e) && courseAccessError(e.code, e.status)) || errorMessage(e);

export default function BulkAssignSection({ mentorId }: { mentorId: string }) {
  const divisions = useDivisions();
  const courses = useCourses();
  const bulk = useBulkAssign();
  const active = activeDivisions(divisions.data);
  const [choice, setChoice] = useState("ALL");
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [divisionIds, setDivisionIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BulkAssignmentResult | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const reset = () => { setPreview(null); setMessage(null); };

  async function run(dryRun: boolean) {
    const { input, problem } = bulkAssignInput(mentorId, choice, courseIds, divisionIds);
    if (!input) return setMessage({ tone: "error", text: problem ?? "Choose what to assign." });
    setMessage(null);
    try {
      const r = await bulk.mutateAsync({ ...input, dryRun });
      if (dryRun) setPreview(r);
      else {
        setPreview(null);
        setMessage({ tone: "success", text: `Assigned: ${bulkAssignSummary(r.counts)}.` });
      }
    } catch (err) {
      setMessage({ tone: "error", text: changeError(err) });
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 p-4" data-testid="bulk-assign">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Assign many courses</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Assign
          <select value={choice} onChange={(e) => { setChoice(e.target.value); reset(); }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal min-w-[200px]" data-testid="bulk-assign-choice">
            <option value="ALL">All courses (every division)</option>
            {active.map((d) => (
              <option key={d.id} value={`DIVISION:${d.id}`}>All {d.name} courses</option>
            ))}
            <option value="PAIRS">Choose courses…</option>
          </select>
        </label>
        <button type="button" className={btnSecondary} disabled={bulk.isPending} onClick={() => void run(true)} data-testid="bulk-assign-preview">
          {bulk.isPending && bulk.variables?.dryRun ? <Spinner className="h-3.5 w-3.5" /> : null} Preview
        </button>
      </div>

      {choice === "PAIRS" && (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-gray-600">Courses</legend>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 p-2">
              {(courses.data ?? []).filter((c) => c.status !== "ARCHIVED").map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <input type="checkbox" checked={courseIds.includes(c.id)} onChange={() => { setCourseIds((l) => toggle(l, c.id)); reset(); }} />
                  {c.title}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-xs font-semibold text-gray-600">Divisions</legend>
            {active.map((d) => (
              <label key={d.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={divisionIds.includes(d.id)} onChange={() => { setDivisionIds((l) => toggle(l, d.id)); reset(); }} />
                {d.name}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {preview && (
        <div className="mt-4" data-testid="bulk-assign-result">
          <p className="text-sm font-semibold text-gray-800">{bulkAssignSummary(preview.counts)}</p>
          {preview.pairs.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-100 text-xs">
              {preview.pairs.map((p) => (
                <li key={`${p.course.id}-${p.division.id}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span>{p.course.title} · {p.division.name}</span>
                  <span className={p.state === "ALREADY_ASSIGNED" ? "text-gray-500" : "font-semibold text-emerald-800"}>{PAIR_STATE_TEXT[p.state] ?? p.state}</span>
                </li>
              ))}
            </ul>
          )}
          {preview.counts.notOffered > 0 && <p className="mt-2 text-xs text-amber-800">{preview.counts.notOffered} chosen pair{preview.counts.notOffered === 1 ? " is" : "s are"} not offered by that division and will be skipped.</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} disabled={bulk.isPending || !bulkAssignChanges(preview.counts)} onClick={() => void run(false)} data-testid="bulk-assign-confirm">
              {bulk.isPending && !bulk.variables?.dryRun ? <Spinner className="h-3.5 w-3.5 !text-white" /> : null} Confirm assignment
            </button>
            <button type="button" className={btnSecondary} onClick={reset}>Cancel</button>
          </div>
          {!bulkAssignChanges(preview.counts) && <p className="mt-2 text-xs text-gray-600">Nothing to assign: every pair is already assigned or not offered.</p>}
        </div>
      )}
      {message && <div className="mt-3"><Alert tone={message.tone}>{message.text}</Alert></div>}
    </section>
  );
}
