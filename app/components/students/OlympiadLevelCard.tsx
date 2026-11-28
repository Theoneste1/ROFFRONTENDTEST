"use client";

/**
 * A student's Olympiad level: the current level, whether it follows the grade or was set by hand, the level the grade
 * suggests, a form to change it (with a reason), and the full history — who, when, why. Used on the Administrator's
 * user page and wherever a coach opens a student (students.classifyLevel; the backend checks the scope).
 */
import { useState, type FormEvent } from "react";
import { History } from "lucide-react";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { changeText, changedByText, levelChangeProblem, levelSummary, setLevelInput, LEVEL_REASON } from "@/lib/accounts/olympiad-level";
import { useOlympiadLevel, useSetOlympiadLevel } from "@/lib/queries/olympiad-level";
import { formatDateTime } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";

const field = "w-full text-sm text-gray-800 bg-white border border-gray-300 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-[#00428C]/20 focus:border-[#00428C]";

const ERRORS: Record<string, string> = {
  NO_SUGGESTED_LEVEL: "The student's grade suggests no level: choose one.",
  UNKNOWN_DIVISION: "That level is not available any more. Reload and choose another.",
  STUDENT_NOT_FOUND: "You cannot change this student's level.",
};

export default function OlympiadLevelCard({ studentId, canChange, className = "" }: { studentId: string; canChange: boolean; className?: string }) {
  const view = useOlympiadLevel(studentId);
  const set = useSetOlympiadLevel(studentId);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!view.data) return;
    const problem = levelChangeProblem(view.data, choice, reason);
    if (problem) return setMessage({ tone: "error", text: problem });
    try {
      await set.mutateAsync(setLevelInput(choice, reason));
      setChoice("");
      setReason("");
      setMessage({ tone: "success", text: "Level saved. Tests and courses now follow it." });
    } catch (err) {
      setMessage({ tone: "error", text: (isApiError(err) && ERRORS[err.code]) || errorMessage(err) });
    }
  }

  // Outside the viewer's scope (a coach opening a student of another programme): nothing to show.
  if (view.isError && isApiError(view.error) && (view.error.status === 403 || view.error.status === 404)) return null;
  return (
    <section className={`bg-white rounded-2xl p-6 shadow-sm border border-gray-100/80 ${className}`} id="olympiad-level" data-testid="olympiad-level-card">
      <h2 className="text-base font-bold text-gray-900 mb-1">Olympiad level</h2>
      <p className="text-xs text-gray-600 mb-4">The level decides which tests and courses the student gets. It follows the school grade unless it is set by hand.</p>
      {view.isPending ? (
        <LoadingBlock />
      ) : view.isError ? (
        <ErrorState error={view.error} title="Couldn't load the Olympiad level" onRetry={() => view.refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">Current level</dt>
              <dd className="mt-0.5 font-semibold text-gray-900" data-testid="olympiad-level-current">{levelSummary(view.data)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">School grade</dt>
              <dd className="mt-0.5 text-gray-800">{view.data.gradeLevel ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">Suggested by the grade</dt>
              <dd className="mt-0.5 text-gray-800">{view.data.suggestedLevel?.name ?? "None"}</dd>
            </div>
          </dl>

          {canChange && (
            <form onSubmit={submit} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end" noValidate>
              <div>
                <label htmlFor={`level-${studentId}`} className="block text-xs font-semibold text-gray-700 mb-1">Change to</label>
                <select id={`level-${studentId}`} className={field} value={choice} onChange={(e) => { setChoice(e.target.value); setMessage(null); }} data-testid="olympiad-level-choice">
                  <option value="">Choose…</option>
                  {view.data.choices.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                  {view.data.manual && view.data.suggestedLevel && <option value="AUTOMATIC">Follow the grade ({view.data.suggestedLevel.name})</option>}
                </select>
              </div>
              <div>
                <label htmlFor={`level-reason-${studentId}`} className="block text-xs font-semibold text-gray-700 mb-1">Why the level changes</label>
                <input id={`level-reason-${studentId}`} className={field} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LEVEL_REASON.max} placeholder="For example: the teacher submits for the Middle class" data-testid="olympiad-level-reason" />
              </div>
              <button type="submit" disabled={set.isPending} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#00428C] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#003370] disabled:opacity-60" data-testid="olympiad-level-save">
                {set.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />} Save level
              </button>
            </form>
          )}
          {message && <div className="mt-3"><Alert tone={message.tone}>{message.text}</Alert></div>}

          <h3 className="mt-6 mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <History className="h-4 w-4" aria-hidden="true" /> History
          </h3>
          {view.data.history.length === 0 ? (
            <p className="text-sm text-gray-600">No change recorded yet.</p>
          ) : (
            <>
              <ol className="divide-y divide-gray-100" data-testid="olympiad-level-history">
                {(showAll ? view.data.history : view.data.history.slice(0, 5)).map((c) => (
                  <li key={c.id} className="py-2.5 text-sm">
                    <p className="font-semibold text-gray-800">{changeText(c)}</p>
                    <p className="text-xs text-gray-600">{formatDateTime(c.createdAt)} · {changedByText(c)}</p>
                    {c.reason && <p className="mt-0.5 text-xs text-gray-600 whitespace-pre-line">Reason: {c.reason}</p>}
                  </li>
                ))}
              </ol>
              {view.data.history.length > 5 && (
                <button type="button" className="mt-2 text-xs font-semibold text-[#00428C] hover:underline" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer" : `Show all ${view.data.history.length}`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
