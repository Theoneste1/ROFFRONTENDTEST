'use client';

/**
 * Submit or resubmit work (`POST /submissions`, multipart: answerText, note,
 * files). Whether the form is offered comes from the backend's `canSubmit`;
 * the backend re-checks deadline, late and resubmission rules on every call.
 */
import React, { useRef, useState, type DragEvent } from 'react';
import { UploadCloud, AlertCircle, Check, X, FileText, RotateCcw } from 'lucide-react';
import type { StudentAssignment, Submission, SubmissionHistory } from '@/lib/api/types';
import { SUBMISSION_UPLOAD, submissionsApi } from '@/lib/api/assessment';
import { useSubmitAssignment } from '@/lib/queries/assessment';
import { errorMessage } from '@/lib/api/errors';
import { formatDateTime, formatFileSize, hasAcceptedExtension } from '@/lib/format';
import { Alert, Spinner } from '@/app/components/ui/feedback';
import FileButton from '@/app/components/ui/FileButton';
import { StatusBadge } from '../../../components/studentUi';
import { useNow } from '@/lib/hooks/useNow';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { submitErrorMessage, submitErrorStale } from '@/lib/assessment/student-state';

interface Props {
  assignment: StudentAssignment;
  submission: Submission | undefined;
  openRequest: SubmissionHistory['openRequest'];
  onShowResults: () => void;
}

export default function SubmissionPanel({ assignment: a, submission, openRequest, onShowResults }: Props) {
  const hasSubmission = !!a.submission;
  const resubmissionRequested = a.displayStatus === 'Resubmission Requested';
  const request = openRequest ?? submission?.resubmissionRequest ?? null;

  return (
    <div className="space-y-6">
      {resubmissionRequested && request && (
        <div className="bg-red-50 border border-red-200 rounded-3xl p-5">
          <div className="flex items-center gap-2 text-red-700 font-bold text-sm">
            <RotateCcw className="w-4 h-4" /> Resubmission requested
          </div>
          <p className="mt-2 text-sm text-red-900 whitespace-pre-line">{request.note}</p>
          <p className="mt-2 text-xs font-semibold text-red-700">Resubmit before {formatDateTime(request.dueAt)}</p>
        </div>
      )}

      {a.canSubmit ? (
        <SubmissionForm assignment={a} isResubmission={hasSubmission} />
      ) : (
        <SubmissionStatusCard assignment={a} submission={submission} onShowResults={onShowResults} />
      )}
    </div>
  );
}

function SubmissionStatusCard({ assignment: a, submission, onShowResults }: { assignment: StudentAssignment; submission: Submission | undefined; onShowResults: () => void }) {
  const now = useNow();
  const latest = submission?.revisions?.length ? submission.revisions[submission.revisions.length - 1] : null;

  return (
    <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Your Submission</h2>

      {!a.submission ? (
        <Alert tone="info">
          {a.status === 'CLOSED' || new Date(a.deadline).getTime() < now
            ? 'The deadline has passed and this assignment no longer accepts submissions.'
            : 'Submissions are not open for this assignment.'}
        </Alert>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <StatusBadge status={a.displayStatus} />
            {a.submission.isLate && <span className="text-[11px] font-semibold text-orange-600">Submitted late</span>}
          </div>
          <dl className="text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Submitted</dt>
              <dd className="font-semibold text-gray-800 text-right">{formatDateTime(a.submission.submittedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-gray-500">Attempts</dt>
              <dd className="font-semibold text-gray-800">{submission?.revisions.length ?? a.submission.revisionCount + 1}</dd>
            </div>
          </dl>

          {latest?.answerText && (
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 text-xs text-gray-700 whitespace-pre-line max-h-48 overflow-y-auto">{latest.answerText}</div>
          )}
          {latest && latest.attachments.length > 0 && submission && (
            <div className="space-y-2">
              {latest.attachments.map((att) => (
                <FileButton key={att.id} file={att.file} fetchFile={() => submissionsApi.attachmentFile(submission.id, att.id, att.file.originalName)} />
              ))}
            </div>
          )}

          {a.displayStatus === 'Reviewed' ? (
            <button type="button" onClick={onShowResults} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md transition">
              View your result
            </button>
          ) : (
            <p className="text-[11px] text-gray-500">
              {a.displayStatus === 'Pending Review'
                ? 'A coach is reviewing your work. Your result appears here once it is published.'
                : 'Your work has been received and will be reviewed by a coach.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SubmissionForm({ assignment: a, isResubmission }: { assignment: StudentAssignment; isResubmission: boolean }) {
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = useSubmitAssignment();
  const qc = useQueryClient();
  const now = useNow();

  const late = new Date(a.deadline).getTime() < now;
  const canResubmitAgain = a.allowResubmission;
  const remaining =
    a.allowResubmission && a.maxResubmissions > 0 ? Math.max(a.maxResubmissions - (a.submission?.revisionCount ?? 0) - (isResubmission ? 1 : 0), 0) : null;
  const hasContent = answer.trim().length > 0 || files.length > 0;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!hasAcceptedExtension(f.name, SUBMISSION_UPLOAD.accept)) {
        setFileError(`"${f.name}" is not an accepted file type (PDF, images, Word, ZIP or plain text).`);
        continue;
      }
      if (f.size === 0) {
        setFileError(`"${f.name}" is empty.`);
        continue;
      }
      if (f.size > SUBMISSION_UPLOAD.maxFileBytes) {
        setFileError(`"${f.name}" is larger than 20 MB.`);
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    if (next.length > SUBMISSION_UPLOAD.maxFiles) {
      setFileError(`You can attach up to ${SUBMISSION_UPLOAD.maxFiles} files.`);
      next.length = SUBMISSION_UPLOAD.maxFiles;
    }
    if (next.reduce((s, f) => s + f.size, 0) > SUBMISSION_UPLOAD.maxRequestBytes) {
      setFileError('The files together are larger than 100 MB.');
      return;
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function onConfirm() {
    if (submit.isPending) return;
    submit.mutate(
      { assignmentId: a.id, answerText: answer, note, files },
      {
        onSuccess: () => {
          setShowConfirmModal(false);
          setAnswer('');
          setNote('');
          setFiles([]);
          setShowSuccessModal(true);
          setTimeout(() => setShowSuccessModal(false), 2500);
        },
        onError: (err) => {
          setShowConfirmModal(false);
          // The answer and files stay in the form, so the student can retry after fixing the problem.
          // A state refusal means this page is out of date: reload the assignment and submission.
          if (submitErrorStale(err)) {
            void qc.invalidateQueries({ queryKey: queryKeys.assignments.all });
            void qc.invalidateQueries({ queryKey: queryKeys.submissions.all });
          }
        },
      },
    );
  }

  const submitError = submit.error;

  return (
    <>
      <div className="bg-white border border-blue-100 rounded-3xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900 mb-6">{isResubmission ? 'Resubmit Your Work' : 'Assignment Submission'}</h2>

        <div className="space-y-5">
          {late && a.allowLateSubmission && <Alert tone="info">The deadline has passed. Your work will be accepted but marked as late.</Alert>}
          {submitError != null && (
            <Alert tone="error">{submitErrorMessage(submitError) ?? errorMessage(submitError, "Your work couldn't be sent. Check your connection and try again — your answer and files are still here.")}</Alert>
          )}

          <div>
            <label htmlFor="answer" className="sr-only">
              Your answer
            </label>
            <textarea
              id="answer"
              value={answer}
              maxLength={SUBMISSION_UPLOAD.answerMax}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer, or share a link to your work (Google Drive, Desmos, …)"
              className="w-full h-32 p-4 text-xs border border-gray-200 rounded-2xl bg-white outline-none focus:ring-2 focus:ring-blue-300 resize-y placeholder:text-gray-400"
            />
            {answer.length > SUBMISSION_UPLOAD.answerMax * 0.9 && (
              <p className="text-[10px] text-gray-400 text-right">
                {answer.length} / {SUBMISSION_UPLOAD.answerMax}
              </p>
            )}
          </div>

          <div className="text-center font-bold text-sm text-gray-800">AND / OR</div>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`block border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition bg-gray-50/50 ${dragging ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 hover:border-blue-300'}`}
          >
            <input ref={inputRef} type="file" multiple accept={SUBMISSION_UPLOAD.accept} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-700">Upload Files</p>
            <p className="text-[10px] text-gray-400 mt-1">{SUBMISSION_UPLOAD.label}</p>
          </label>
          {fileError && <p className="text-[11px] text-red-600 -mt-3">{fileError}</p>}

          {files.length > 0 && (
            <ul className="space-y-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="text-xs font-medium text-gray-800 truncate flex-1" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-[10px] text-gray-400">{formatFileSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Remove ${f.name}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label htmlFor="note" className="block text-[11px] font-semibold text-gray-600 mb-1">
              Note for your coach (optional)
            </label>
            <input
              id="note"
              value={note}
              maxLength={SUBMISSION_UPLOAD.noteMax}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowConfirmModal(true)}
            disabled={!hasContent || submit.isPending}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResubmission ? 'Resubmit' : 'Submit'}
          </button>

          <p className="text-[11px] text-gray-400 text-center">Your assignment will be reviewed by a coach.</p>
        </div>
      </div>

      {/* Confirm submission */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl transition-all">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                <AlertCircle className="w-10 h-10 stroke-[1.75]" />
              </div>
              <div>
                <h3 id="confirm-title" className="text-2xl font-bold text-gray-900 leading-tight">
                  Confirm Submission?
                </h3>
                <p className="text-sm text-gray-500 mt-2 leading-snug">
                  {canResubmitAgain
                    ? `You can still replace this work until a coach starts reviewing it or the deadline passes${remaining !== null ? ` (${remaining} resubmission${remaining === 1 ? '' : 's'} left after this one)` : ''}.`
                    : 'You are about to submit this work. No changes can be made after submitting.'}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {files.length} file{files.length === 1 ? '' : 's'}
                  {answer.trim() ? ' · typed answer' : ''}
                </p>
              </div>
            </div>

            <hr className="my-6 border-gray-100" />

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={submit.isPending}
                className="px-6 py-2 bg-blue-50 text-blue-900 text-sm font-medium rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={submit.isPending}
                className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
              >
                {submit.isPending && <Spinner className="h-4 w-4 !text-white" />}
                {submit.isPending ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success */}
      {showSuccessModal && (
        <div onClick={() => setShowSuccessModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-50 flex items-center justify-center p-4" role="status">
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 transition-all">
            <div className="w-24 h-24 rounded-full border-4 border-emerald-500 text-emerald-500 flex items-center justify-center mx-auto">
              <Check className="w-14 h-14 stroke-[2.5]" />
            </div>
            <hr className="border-gray-100 my-4" />
            <h3 className="text-2xl font-bold text-gray-900">Submission confirmed!</h3>
          </div>
        </div>
      )}
    </>
  );
}
