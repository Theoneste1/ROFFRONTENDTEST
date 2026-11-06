'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';
import type { StudentAssignment } from '@/lib/api/types';
import { useResult } from '@/lib/queries/assessment';
import { resultsApi } from '@/lib/api/assessment';
import { formatDateTime, personName } from '@/lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '@/app/components/ui/feedback';
import FileButton from '@/app/components/ui/FileButton';

/**
 * The published result (`GET /me/results/:submissionId`). Students never see a
 * score before publication; results allow no replies (`repliesAllowed` is
 * false), so questions go to the assignment discussion.
 */
export default function ResultPanel({ assignment: a, onAsk }: { assignment: StudentAssignment; onAsk: () => void }) {
  const published = a.displayStatus === 'Reviewed' && !!a.submission;
  const result = useResult(a.submission?.id, published);

  if (!published) {
    const reason =
      a.displayStatus === 'Not Started'
        ? 'Submit your work to receive a result.'
        : a.displayStatus === 'Resubmission Requested'
          ? 'Your coach asked for a new attempt. Resubmit from the Assignment tab.'
          : 'Your work is being reviewed. The result appears here once it is published.';
    return (
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-gray-200/80">
        <EmptyState title="No result yet" description={reason} />
      </div>
    );
  }

  if (result.isPending) return <LoadingBlock label="Loading your result…" />;
  if (result.isError) return <ErrorState error={result.error} title="Couldn't load your result" onRetry={() => result.refetch()} />;

  const r = result.data;
  const pct = Math.max(0, Math.min(100, r.percentage));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Score */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">Your Score</h2>
          <div className="text-3xl font-bold text-blue-600">
            {r.score}/{r.maximumMarks}
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap justify-between gap-2 mt-2 text-sm text-gray-500">
          <p>You scored {r.percentage}% on this assignment</p>
          <p className="font-semibold text-indigo-700">+{r.pointsAwarded} leaderboard points</p>
        </div>
        <p className="text-xs text-gray-400 mt-2">Published {formatDateTime(r.publishedAt)}</p>
      </div>

      {/* Feedback */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
        <h2 className="text-lg font-bold text-gray-900 mb-3">Coach Feedback</h2>
        {r.feedback.text ? (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{r.feedback.text}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <span className="font-semibold">{personName(r.feedback.mentor, 'Your coach')}</span>
              {r.reviewedAt && (
                <>
                  <span>•</span>
                  <span>{formatDateTime(r.reviewedAt)}</span>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No written feedback for this result.</p>
        )}
        {r.feedback.files.length > 0 && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {r.feedback.files.map((f) => (
              <FileButton key={f.id} file={f.file} fetchFile={() => resultsApi.feedbackFile(r.submissionId, f.id, f.file.originalName)} />
            ))}
          </div>
        )}
      </div>

      {/* Earlier published versions (after a correction) */}
      {r.previousVersions.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200/80">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Earlier versions of this result</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {r.previousVersions.map((v, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
                <span>
                  {v.score}/{v.maximumMarks} ({v.percentage}%)
                </span>
                <span className="text-xs text-gray-400">Published {formatDateTime(v.publishedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#EEF4FF] border border-[#D0E1FF] rounded-xl px-4 py-3">
        <p className="text-sm text-[#1E40AF]">Questions about your result? Ask in this assignment&apos;s discussion.</p>
        <button type="button" onClick={onAsk} className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-[#2B36C8] hover:bg-blue-800 px-4 py-2 rounded-lg">
          <MessageSquare className="w-4 h-4" /> Open discussion
        </button>
      </div>
    </div>
  );
}
