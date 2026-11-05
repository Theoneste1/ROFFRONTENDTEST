"use client";

import { useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { REVIEW_ADMIN_RULES } from "@/lib/api/admin";
import type { AdminSubmission } from "@/lib/api/types";
import { useResultAction, useResultHistory } from "@/lib/queries/admin";
import { formatDateTime, personName } from "@/lib/format";
import { ConfirmDialog, btnPrimary, btnSecondary } from "../../components/adminUi";

/**
 * Publication of one result: publish an APPROVED result, or reopen a
 * PUBLISHED one (withdrawn from the student and sent back to the mentor —
 * administrators never change scores themselves). Includes the result history.
 */
export default function ResultActions({ submission, onDone }: { submission: AdminSubmission; onDone: (message: string) => void }) {
  const action = useResultAction(submission.id);
  const published = submission.status === "PUBLISHED";
  const history = useResultHistory(submission.id, published || !!submission.resultRelease);
  const [confirm, setConfirm] = useState<"publish" | "reopen" | null>(null);

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      {submission.status === "APPROVED" && (
        <button type="button" onClick={() => setConfirm("publish")} className={`${btnPrimary} w-full`}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> Publish result
        </button>
      )}
      {published && (
        <button type="button" onClick={() => setConfirm("reopen")} className={`${btnSecondary} w-full`}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reopen result
        </button>
      )}
      {history.data && history.data.publications.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Result history</h3>
          <ul className="space-y-1.5 text-[11px] text-gray-500">
            {history.data.publications.map((p) => (
              <li key={p.reviewId}>
                Cycle {p.cycle}: {p.score} / {submission.assignment.maximumMarks} ({p.percentage}%) · published {formatDateTime(p.publishedAt)} by {personName(p.publishedBy, "—")}
                {p.withdrawn && (
                  <span className="block text-rose-600">
                    Withdrawn {formatDateTime(p.withdrawn.at)} by {personName(p.withdrawn.by, "—")}: {p.withdrawn.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirm === "publish" && (
        <ConfirmDialog
          title="Publish this result?"
          body={`${personName(submission.student)} sees the score, feedback and files now, and their points update.`}
          confirmLabel="Publish result"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await action.mutateAsync({ type: "publish" });
            onDone("Result published to the student.");
          }}
        />
      )}
      {confirm === "reopen" && (
        <ConfirmDialog
          title="Reopen this published result?"
          body="The result is withdrawn from the student (and its points removed) and sent back to the mentor for correction. You approve and publish it again afterwards."
          confirmLabel="Reopen result"
          tone="danger"
          note={{ label: "Reason (shown to the mentor)", required: true, min: REVIEW_ADMIN_RULES.reopenNote.min, max: REVIEW_ADMIN_RULES.reopenNote.max }}
          onClose={() => setConfirm(null)}
          onConfirm={async (note) => {
            await action.mutateAsync({ type: "reopen", note });
            onDone("Result reopened and sent back to the mentor.");
          }}
        />
      )}
    </div>
  );
}
