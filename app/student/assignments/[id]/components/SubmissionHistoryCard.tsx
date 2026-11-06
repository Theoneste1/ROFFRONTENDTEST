'use client';

import React, { useState } from 'react';
import { History } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SubmissionHistory } from '@/lib/api/types';
import { submissionsApi } from '@/lib/api/assessment';
import { formatDateTime } from '@/lib/format';
import { ErrorState, Spinner } from '@/app/components/ui/feedback';
import FileButton from '@/app/components/ui/FileButton';

/** Every attempt (revision 1, 2, 3 …) with its answer and files, plus resubmission requests. */
export default function SubmissionHistoryCard({ submissionId, query }: { submissionId: string; query: UseQueryResult<SubmissionHistory> }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
      <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-gray-500" /> Submission History
      </h2>

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Couldn't load your submission history" onRetry={() => query.refetch()} />
      ) : (
        <ol className="space-y-3">
          {query.data.attempts
            .slice()
            .sort((x, y) => y.revisionNumber - x.revisionNumber)
            .map((rev, idx) => {
              const open = expanded === rev.id || (expanded === null && idx === 0);
              return (
                <li key={rev.id} className="border border-gray-200 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? '' : rev.id)}
                    aria-expanded={open}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <span className="text-sm font-bold text-gray-900">
                      Attempt {rev.revisionNumber}
                      {idx === 0 && <span className="ml-2 text-[10px] font-bold uppercase text-blue-600">Latest</span>}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(rev.submittedAt)}
                      {rev.isLate && <span className="ml-2 font-semibold text-orange-600">Late</span>}
                    </span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 space-y-3">
                      {rev.answerText ? (
                        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-line max-h-56 overflow-y-auto">{rev.answerText}</div>
                      ) : null}
                      {rev.note && (
                        <p className="text-xs text-gray-500">
                          <span className="font-semibold">Note:</span> {rev.note}
                        </p>
                      )}
                      {rev.attachments.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {rev.attachments.map((att) => (
                            <FileButton key={att.id} file={att.file} fetchFile={() => submissionsApi.attachmentFile(submissionId, att.id, att.file.originalName)} />
                          ))}
                        </div>
                      ) : (
                        !rev.answerText && <p className="text-xs text-gray-400">No files in this attempt.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}

          {query.data.resubmissionRequests.length > 0 && (
            <li className="pt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Coach requests</p>
              <ul className="space-y-2">
                {query.data.resubmissionRequests.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="text-xs text-gray-700 bg-red-50/50 border border-red-100 rounded-xl px-3 py-2">
                    <span className="font-semibold">{r.type === 'WITHDRAWN' || /withdraw/i.test(r.type) ? 'Request withdrawn' : 'Resubmission requested'}</span>
                    <span className="text-gray-400"> · {formatDateTime(r.at)}</span>
                    {r.note && <p className="mt-1 whitespace-pre-line">{r.note}</p>}
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
