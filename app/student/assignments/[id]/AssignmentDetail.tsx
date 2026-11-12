'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { useAssignment, useSubmission, useSubmissionHistory } from '@/lib/queries/assessment';
import { assignmentsApi } from '@/lib/api/assessment';
import { isApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';
import { EmptyState, ErrorState, LoadingBlock } from '@/app/components/ui/feedback';
import FileButton from '@/app/components/ui/FileButton';
import DiscussionPanel from '@/app/components/discussions/DiscussionPanel';
import { StatusBadge } from '../../components/studentUi';
import SubmissionPanel from './components/SubmissionPanel';
import SubmissionHistoryCard from './components/SubmissionHistoryCard';
import ResultPanel from './components/ResultPanel';
import { useNow } from '@/lib/hooks/useNow';
import { assignmentTiming, studentAccessDenied } from '@/lib/assessment/student-state';
import AccessDenied, { TimingBadge } from '../../components/AccessDenied';

type Tab = 'assignment' | 'discussion' | 'results';
const TABS: { id: Tab; label: string }[] = [
  { id: 'assignment', label: 'Assignment' },
  { id: 'discussion', label: 'Discussion' },
  { id: 'results', label: 'Results' },
];

export default function AssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get('tab');
  const activeTab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : 'assignment';
  const setTab = (t: Tab) => router.replace(`/student/assignments/${assignmentId}?tab=${t}`, { scroll: false });

  const assignment = useAssignment(assignmentId);
  const submissionId = assignment.data?.submission?.id ?? null;
  const submission = useSubmission(submissionId);
  const history = useSubmissionHistory(submissionId);
  const now = useNow();

  if (assignment.isPending) return <LoadingBlock label="Loading assignment…" />;

  if (assignment.isError) {
    // 404 = "not found or not available to you" (the API never reveals which).
    const notFound = isApiError(assignment.error) && (assignment.error.status === 404 || assignment.error.status === 400);
    return (
      <div className="min-h-screen p-4 md:p-8 bg-[#E6EBF2]">
        <div className="max-w-7xl mx-auto space-y-6">
          <Link href="/student/assignments" className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Back to assignments
          </Link>
          {studentAccessDenied(assignment.error) ? (
            <AccessDenied {...studentAccessDenied(assignment.error)!} />
          ) : notFound ? (
            <div className="bg-white rounded-3xl border border-gray-200">
              <EmptyState title="Assignment not found" description="This assignment doesn't exist or isn't available to you." />
            </div>
          ) : (
            <ErrorState error={assignment.error} title="Couldn't load this assignment" onRetry={() => assignment.refetch()} />
          )}
        </div>
      </div>
    );
  }

  const a = assignment.data;

  return (
    <div className="min-h-screen p-4 md:p-8 bg-[#E6EBF2]">
      <div className="max-w-7xl mx-auto">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/student/assignments'))}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>

        {/* Title & metadata */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{a.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>Due {formatDateTime(a.deadline)}</span>
            </div>
            <StatusBadge status={a.displayStatus} />
            <TimingBadge timing={assignmentTiming(a, now)} />
            {a.status === 'CLOSED' && <span className="px-3 py-1 bg-gray-200 text-gray-600 rounded-full text-xs font-semibold">Closed</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-300/70 mb-6">
          <nav className="-mb-px flex gap-8" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setTab(t.id)}
                className={`pb-3 text-base font-semibold transition-colors relative ${activeTab === t.id ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t.label}
                {activeTab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'assignment' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6 min-w-0">
              {/* Description & instructions */}
              <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Description</h2>
                {a.description && <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-4">{a.description}</p>}
                <h3 className="text-sm font-bold text-gray-900 mb-2">Instructions</h3>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{a.instructions}</p>
              </div>

              {/* Details */}
              <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Detail label="Course" value={a.course.title} />
                  <Detail label="Division" value={`${a.division.name} division`} />
                  <Detail label="Deadline" value={formatDateTime(a.deadline)} />
                  <Detail label="Marks & points" value={`Out of ${a.maximumMarks} · up to ${a.points} leaderboard points`} />
                  <Detail
                    label="Resubmissions"
                    value={
                      a.allowResubmission
                        ? a.maxResubmissions > 0
                          ? `Allowed (up to ${a.maxResubmissions}) before review starts`
                          : 'Allowed before review starts'
                        : 'Not allowed'
                    }
                  />
                  <Detail label="Late submissions" value={a.allowLateSubmission ? 'Accepted (marked late)' : 'Not accepted'} />
                </div>
              </div>

              {/* Brief files */}
              {a.attachments.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Assignment Files</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {a.attachments.map((att) => (
                      <FileButton key={att.id} file={att.file} fetchFile={() => assignmentsApi.briefFile(a.id, att.id, att.file.originalName)} />
                    ))}
                  </div>
                </div>
              )}

              {submissionId && <SubmissionHistoryCard submissionId={submissionId} query={history} />}
            </div>

            <div className="lg:col-span-1 min-w-0">
              <SubmissionPanel assignment={a} submission={submission.data} openRequest={history.data?.openRequest ?? null} onShowResults={() => setTab('results')} />
            </div>
          </div>
        )}

        {activeTab === 'discussion' && (
          <DiscussionPanel
            scope={{ kind: 'assignment', assignmentId: a.id }}
            banner="This is a general discussion for this assignment. Be respectful and help each other — don't post solutions!"
          />
        )}

        {activeTab === 'results' && <ResultPanel assignment={a} onAsk={() => setTab('discussion')} />}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}
