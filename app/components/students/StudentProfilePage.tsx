"use client";

/**
 * A student's profile, the same in every portal (`/<portal>/profiles/:id`): the Student Profile header, then what the
 * viewer may do — the Olympiad level (students.classifyLevel; the backend checks the scope; a Coach only sees it, owner
 * 2026-11-27: coaches edit no student profile data), the account page for
 * administrators, the student page for teachers. A student who may not be viewed gets "not found" (as the backend).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { hasFeature } from "@/lib/api/capabilities";
import { isApiError } from "@/lib/api/errors";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { studentOverviewApi } from "@/lib/accounts/student-overview";
import { queryKeys } from "@/lib/query/keys";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import StudentProfileHeader from "./StudentProfileHeader";
import OlympiadLevelCard from "./OlympiadLevelCard";
import { mayChangeLevel } from "@/lib/accounts/olympiad-level";

const action = "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50";

export default function StudentProfilePage({ studentId }: { studentId: string }) {
  const router = useRouter();
  const { user, can } = useSession();
  const { detection } = useBackendCapabilities();
  const supported = hasFeature(detection, "studentOverview");
  const overview = useQuery({ queryKey: queryKeys.overview(studentId), queryFn: () => studentOverviewApi.get(studentId), enabled: supported });
  const role = user?.role;
  const admin = role === "ADMIN" || role === "SUPER_ADMIN";
  const levels = hasFeature(detection, "olympiadLevels") && can("students.classifyLevel") && (admin || role === "MENTOR" || role === "HEAD_COACH");

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800">
      <button type="button" onClick={() => router.back()} className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-[#00428C] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
      </button>
      {!supported ? (
        detection ? <EmptyState title="Profiles are not available yet" description="The server does not offer student profiles yet." /> : <LoadingBlock />
      ) : overview.isPending ? (
        <LoadingBlock />
      ) : overview.isError ? (
        isApiError(overview.error) && overview.error.status === 404 ? (
          <EmptyState title="Student not found" description="This student does not exist, or their profile is not visible to you." />
        ) : (
          <ErrorState error={overview.error} title="Couldn't load this profile" onRetry={() => overview.refetch()} />
        )
      ) : (
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <StudentProfileHeader
            student={overview.data}
            actions={
              admin ? (
                <Link href={`/admin/users/${studentId}`} className={action}>Manage account</Link>
              ) : role === "TEACHER" ? (
                <Link href={`/teacher/students/${studentId}`} className={action}>Student details</Link>
              ) : undefined
            }
          />
          {levels && <OlympiadLevelCard studentId={studentId} canChange={mayChangeLevel(role)} />}
        </div>
      )}
    </div>
  );
}
