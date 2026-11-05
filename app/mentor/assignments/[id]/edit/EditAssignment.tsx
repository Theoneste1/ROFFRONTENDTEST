"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMentorAssignment, useTeachingScopes } from "@/lib/queries/mentor";
import { isApiError } from "@/lib/api/errors";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import AssignmentWizard from "../../components/AssignmentWizard";
import { ASSIGNMENT_STATUS } from "../../../components/mentorUi";

/** Editing is allowed only while the assignment is DRAFT or REJECTED (backend rule). */
export default function EditAssignment({ assignmentId }: { assignmentId: string }) {
  const assignment = useMentorAssignment(assignmentId);
  const scopes = useTeachingScopes();

  if (assignment.isPending || scopes.isPending) return <LoadingBlock label="Loading assignment…" />;

  const error = assignment.error ?? scopes.error;
  if (error) {
    const notFound = isApiError(error) && (error.status === 404 || error.status === 400 || error.status === 403);
    return (
      <div className="p-8 space-y-6">
        <Link href="/mentor/assignments" className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Assignments
        </Link>
        {notFound ? (
          <div className="bg-white rounded-2xl border border-slate-200">
            <EmptyState title="Assignment not found" description="It doesn't exist or isn't in one of your courses." />
          </div>
        ) : (
          <ErrorState error={error} onRetry={() => assignment.refetch()} />
        )}
      </div>
    );
  }

  const a = assignment.data!;
  if (a.status !== "DRAFT" && a.status !== "REJECTED") {
    return (
      <div className="p-8 space-y-6 max-w-3xl">
        <Link href={`/mentor/assignments/${a.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to assignment
        </Link>
        <Alert tone="info">
          “{a.title}” is {ASSIGNMENT_STATUS[a.status].label.toLowerCase()}. Assignments can only be edited while they are a draft or returned by an administrator
          {a.status === "PENDING_APPROVAL" ? " — recall it to edit it again." : "."}
        </Alert>
      </div>
    );
  }

  return <AssignmentWizard scopes={scopes.data!} existing={a} />;
}
