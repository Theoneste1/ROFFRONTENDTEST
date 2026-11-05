"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTeachingScopes } from "@/lib/queries/mentor";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import AssignmentWizard from "../components/AssignmentWizard";

export default function CreateAssignment() {
  const params = useSearchParams();
  const scopes = useTeachingScopes();

  if (scopes.isPending) return <LoadingBlock label="Loading your courses…" />;
  if (scopes.isError)
    return (
      <div className="p-8">
        <ErrorState error={scopes.error} title="Couldn't load your courses" onRetry={() => scopes.refetch()} />
      </div>
    );
  if (scopes.data.length === 0)
    return (
      <div className="p-8">
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState
            title="You are not assigned to a course yet"
            description="An administrator assigns mentors to a course and division. You can create assignments once you have one."
            action={
              <Link href="/mentor/dashboard" className="text-sm font-semibold text-indigo-700 hover:underline">
                Back to dashboard
              </Link>
            }
          />
        </div>
      </div>
    );

  // `new` changes after "Create another", which remounts a fresh wizard.
  return <AssignmentWizard key={params.get("new") ?? "first"} scopes={scopes.data} initialScope={params.get("scope") ?? undefined} />;
}
