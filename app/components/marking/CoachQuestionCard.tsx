"use client";

/**
 * One question of the coach's marks form (owner-approved design 2026-11-26): "Q1. prompt" with its maximum, quick
 * score buttons 0..max when the maximum is 10 or less (aria-pressed, reachable by keyboard), the number field (always:
 * needed above 10 and by keyboard users who prefer typing), and a collapsible comment. A question left unmarked after a
 * submit attempt is outlined in red with "Not marked yet".
 */
import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { parseWhole } from "@/lib/test-management/marking";
import { inputBad, inputCls, inputOk } from "@/app/components/test-management/shared";

/** The text marksProblems() gives a question with no marks on submit. */
export const MISSING_MARKS = "Give the marks.";

export function CoachQuestionCard({
  q, marks, comment, onMarks, onComment, error, commentError, disabled, idBase,
}: {
  q: { id: string; order: number; prompt: string; maxMarks: number };
  marks: string;
  comment: string;
  onMarks: (value: string) => void;
  onComment: (value: string) => void;
  error?: string;
  commentError?: string;
  disabled: boolean;
  /** A unique prefix for the ids of this card's controls. */
  idBase: string;
}) {
  const [open, setOpen] = useState(comment.trim() !== "");
  const current = parseWhole(marks);
  const quick = q.maxMarks <= 10;
  const missing = error === MISSING_MARKS;
  const showComment = open || comment !== "";
  return (
    <li
      className={`rounded-xl border p-4 transition-colors motion-reduce:transition-none ${error ? "border-red-400 bg-red-50/50 ring-1 ring-red-400" : "border-gray-100 bg-slate-50/70"}`}
      data-testid={`mark-q${q.order}`}
      data-missing={missing || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-gray-900">
          <span className="font-bold">Q{q.order}.</span> <span className="whitespace-pre-wrap break-words">{q.prompt}</span>
        </p>
        <span className="shrink-0 text-xs text-gray-500">max {q.maxMarks}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {quick && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Quick marks for question ${q.order}`}>
            {Array.from({ length: q.maxMarks + 1 }, (_, n) => {
              const on = current === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${n} of ${q.maxMarks}`}
                  disabled={disabled}
                  onClick={() => onMarks(String(n))}
                  className={`h-10 w-10 rounded-lg border text-sm font-semibold tabular-nums transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C] focus-visible:ring-offset-1 disabled:cursor-not-allowed ${
                    on ? "border-[#00428C] bg-[#00428C] text-white" : "border-gray-200 bg-white text-gray-800 hover:border-[#00428C] hover:text-[#00428C] disabled:opacity-60 disabled:hover:border-gray-200 disabled:hover:text-gray-800"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        )}
        <div className="w-28">
          <label htmlFor={`${idBase}-m`} className="block text-xs font-semibold text-gray-700">Marks (of {q.maxMarks})</label>
          <input
            id={`${idBase}-m`}
            inputMode="numeric"
            className={`${inputCls} ${error ? inputBad : inputOk}`}
            value={marks}
            disabled={disabled}
            onChange={(e) => onMarks(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${idBase}-e` : undefined}
          />
        </div>
      </div>
      {error && <p id={`${idBase}-e`} className="mt-2 text-xs font-semibold text-red-700">{missing ? "Not marked yet" : error}</p>}

      {showComment ? (
        <div className="mt-3">
          <label htmlFor={`${idBase}-c`} className="block text-xs font-semibold text-gray-700">Comment (optional)</label>
          <textarea
            id={`${idBase}-c`}
            rows={2}
            maxLength={2000}
            className={`${inputCls} ${commentError ? inputBad : inputOk}`}
            value={comment}
            disabled={disabled}
            onChange={(e) => onComment(e.target.value)}
            aria-invalid={!!commentError}
            aria-describedby={commentError ? `${idBase}-ce` : undefined}
          />
          {commentError && <p id={`${idBase}-ce`} className="mt-1 text-xs text-red-700">{commentError}</p>}
        </div>
      ) : !disabled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#00428C] hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00428C]"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> Add a comment
        </button>
      )}
    </li>
  );
}
