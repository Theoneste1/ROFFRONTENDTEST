"use client";

/**
 * One discussion topic by id: `/student|mentor|admin/discussions/[threadId]`
 * (where `/discussions/:threadId` notification links land).
 *
 * The backend decides access: a topic outside the caller's course × division
 * or assignment, or a hidden/deleted topic for non-admins, is a 404, shown as
 * "not available" without saying why.
 */
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import type { DiscussionThread, Role } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { portalPath } from "@/lib/auth/roles";
import { useThread } from "@/lib/queries/community";
import { useCourse } from "@/lib/queries/learning";
import { isApiError } from "@/lib/api/errors";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { ThreadView } from "./DiscussionPanel";

/** Where the topic lives, in the caller's own portal. */
function contextLink(t: DiscussionThread, role: Role): { href: string; label: string } {
  if (t.assignmentId) {
    if (role === "STUDENT") return { href: `/student/assignments/${t.assignmentId}?tab=discussion`, label: "Open the assignment" };
    return { href: portalPath(role, `assignments/${t.assignmentId}`), label: "Open the assignment" };
  }
  if (role === "STUDENT") return { href: `/student/courses/${t.courseId}?tab=discussion`, label: "All course topics" };
  if (role === "MENTOR") return { href: `/mentor/courses?scope=${t.courseId}:${t.divisionId}&tab=discussion`, label: "All course topics" };
  return { href: "/admin/moderation", label: "Moderation" };
}

export default function ThreadPage({ threadId }: { threadId: string }) {
  const { role } = useSession();
  const thread = useThread(threadId);
  const course = useCourse(thread.data?.courseId ?? "");

  if (!role) return null;
  const home = portalPath(role, "dashboard");

  if (thread.isPending) return <LoadingBlock label="Loading discussion…" />;

  if (thread.isError) {
    const gone = isApiError(thread.error) && [400, 403, 404].includes(thread.error.status);
    return (
      <PageFrame title="Discussion">
        <Link href={home} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        {gone ? (
          <div className="bg-white rounded-2xl border border-gray-100">
            <EmptyState title="This discussion isn't available" description="It may have been removed, or it belongs to a course or division you don't have access to." />
          </div>
        ) : (
          <ErrorState error={thread.error} title="Couldn't load this discussion" onRetry={() => thread.refetch()} />
        )}
      </PageFrame>
    );
  }

  const t = thread.data;
  const ctx = contextLink(t, role);
  const where = t.assignmentId ? "Assignment discussion" : course.data ? `${course.data.title} discussion` : "Course discussion";

  return (
    <PageFrame
      title="Discussion"
      description={
        <span className="inline-flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4" /> {where}
        </span>
      }
    >
      <Link href={ctx.href} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="h-4 w-4" /> {ctx.label}
      </Link>
      <div className="max-w-4xl">
        <ThreadView thread={t} postingDisabled={t.status !== "OPEN"} />
      </div>
    </PageFrame>
  );
}
