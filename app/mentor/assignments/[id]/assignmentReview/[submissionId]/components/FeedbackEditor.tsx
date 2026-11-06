'use client';

import { Trash2 } from 'lucide-react';
import type { Attachment } from '@/lib/api/types';
import { FEEDBACK_UPLOAD, REVIEW_RULES, reviewsApi } from '@/lib/api/mentor';
import FileButton from '@/app/components/ui/FileButton';
import FilePicker from '@/app/components/ui/FilePicker';

/** Mentor feedback (plain text, 2–10,000 characters) and feedback files. */
export default function FeedbackEditor({
  submissionId,
  value,
  onChange,
  files,
  onFiles,
  existing,
  onRemoveExisting,
  disabled,
  error,
}: {
  submissionId: string;
  value: string;
  onChange: (v: string) => void;
  files: File[];
  onFiles: (f: File[]) => void;
  existing: Attachment[];
  onRemoveExisting?: (attachmentId: string) => void;
  disabled: boolean;
  error?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100/50 overflow-hidden">
      <div className="p-6 pb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Coach Feedback</h2>
        <span className="text-[11px] text-gray-400">
          {value.length}/{REVIEW_RULES.feedback.max}
        </span>
      </div>
      <div className="px-6 pb-6 border-t border-gray-100 pt-4 space-y-4">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={7}
          maxLength={REVIEW_RULES.feedback.max}
          disabled={disabled}
          aria-label="Coach feedback"
          className="w-full text-sm text-gray-700 focus:outline-none resize-y bg-transparent disabled:text-gray-500"
          placeholder={disabled ? 'Start the review to write feedback.' : 'Write feedback for the student (they see it once the result is published)...'}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}

        {existing.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase">Feedback files</p>
            {existing.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <FileButton file={a.file} fetchFile={() => reviewsApi.feedbackFile(submissionId, a.id, a.file.originalName)} />
                </div>
                {onRemoveExisting && !disabled && (
                  <button type="button" onClick={() => onRemoveExisting(a.id)} className="p-2 text-gray-400 hover:text-red-600" aria-label={`Remove ${a.file.originalName}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!disabled && (
          <FilePicker files={files} onChange={onFiles} rules={FEEDBACK_UPLOAD} existingCount={existing.length} title="Attach feedback files (optional)" />
        )}
      </div>
    </div>
  );
}
