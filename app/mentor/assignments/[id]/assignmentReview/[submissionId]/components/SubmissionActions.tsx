'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle, X, PlayCircle, Save, Send, RotateCcw, Undo2 } from 'lucide-react';
import type { ReviewStatus } from '@/lib/api/types';
import { REVIEW_RULES } from '@/lib/api/mentor';
import { Spinner } from '@/app/components/ui/feedback';

/**
 * Review actions for the current review status (backend pipeline):
 * ASSIGNED/SENT_BACK → Start review; IN_PROGRESS/MARKED → Save mark,
 * Send to admin, Return for revision; RESUBMISSION_REQUESTED → Withdraw.
 */
export default function SubmissionActions({
  status,
  busy,
  allowResubmission,
  onStart,
  onSave,
  onSend,
  onRequestResubmission,
  onWithdraw,
  successMessage,
  onCloseSuccess,
}: {
  status: ReviewStatus | null;
  busy: string | null;
  allowResubmission: boolean;
  onStart: () => void;
  onSave: () => void;
  onSend: () => void;
  onRequestResubmission: (note: string, dueAt?: string) => void;
  onWithdraw: () => void;
  successMessage: { title: string; body: string } | null;
  onCloseSuccess: () => void;
}) {
  const [showRequest, setShowRequest] = useState(false);
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const btnSecondary =
    'flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-white hover:bg-gray-50 text-gray-800 text-sm font-semibold rounded-xl border border-gray-200 shadow-sm transition-colors text-center disabled:opacity-50';
  const btnPrimary =
    'flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors text-center disabled:opacity-50';

  function submitRequest(e: FormEvent) {
    e.preventDefault();
    const n = note.trim();
    if (n.length < REVIEW_RULES.resubmissionNote.min || n.length > REVIEW_RULES.resubmissionNote.max) {
      setNoteError('Write a note of 5–2,000 characters so the student knows what to change.');
      return;
    }
    if (dueAt && new Date(dueAt).getTime() <= Date.now()) {
      setNoteError('The due date must be in the future.');
      return;
    }
    setNoteError(null);
    onRequestResubmission(n, dueAt ? new Date(dueAt).toISOString() : undefined);
    setShowRequest(false);
  }

  return (
    <>
      <div className="flex flex-col gap-3 pt-4">
        {(status === 'ASSIGNED' || status === 'SENT_BACK') && (
          <button type="button" onClick={onStart} disabled={!!busy} className={btnPrimary}>
            {busy === 'start' ? <Spinner className="h-4 w-4 !text-white" /> : <PlayCircle className="w-4 h-4" />}
            {status === 'SENT_BACK' ? 'Resume Review' : 'Start Review'}
          </button>
        )}

        {(status === 'IN_PROGRESS' || status === 'MARKED') && (
          <>
            <div className="flex items-center gap-3">
              {allowResubmission && (
                <button type="button" onClick={() => setShowRequest(true)} disabled={!!busy} className={btnSecondary}>
                  <RotateCcw className="w-4 h-4" />
                  Return for Revision
                </button>
              )}
              <button type="button" onClick={onSave} disabled={!!busy} className={btnSecondary}>
                {busy === 'mark' ? <Spinner className="h-4 w-4" /> : <Save className="w-4 h-4" />}
                Save Mark
              </button>
            </div>
            <button type="button" onClick={onSend} disabled={!!busy} className={btnPrimary}>
              {busy === 'markAndSubmit' ? <Spinner className="h-4 w-4 !text-white" /> : <Send className="w-4 h-4" />}
              Send Review to Admin
            </button>
            <p className="text-[11px] text-gray-400 text-center">The administrator approves the review and publishes the result to the student.</p>
          </>
        )}

        {status === 'RESUBMISSION_REQUESTED' && (
          <button type="button" onClick={onWithdraw} disabled={!!busy} className={btnSecondary}>
            {busy === 'withdrawResubmission' ? <Spinner className="h-4 w-4" /> : <Undo2 className="w-4 h-4" />}
            Withdraw resubmission request
          </button>
        )}
      </div>

      {/* Return for revision: note + optional due date */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="req-title">
          <form onSubmit={submitRequest} className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-start justify-between">
              <h3 id="req-title" className="text-lg font-bold text-gray-900">
                Ask for a new attempt
              </h3>
              <button type="button" onClick={() => setShowRequest(false)} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">The student sees your note and can resubmit until the due date. Their new attempt comes back to you.</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={REVIEW_RULES.resubmissionNote.max}
              placeholder="What should the student change?"
              aria-label="Note for the student"
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div>
              <label htmlFor="dueAt" className="block text-xs font-semibold text-gray-600 mb-1">
                Resubmit by (optional — default from the platform settings)
              </label>
              <input id="dueAt" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            {noteError && <p className="text-xs text-red-600">{noteError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowRequest(false)} className="px-5 py-2 text-sm text-gray-600">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg">
                Send request
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Success popup (original design) */}
      {successMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="status">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4">
            <div className="flex items-start justify-between mb-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{successMessage.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{successMessage.body}</p>
                </div>
              </div>
              <button type="button" onClick={onCloseSuccess} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
