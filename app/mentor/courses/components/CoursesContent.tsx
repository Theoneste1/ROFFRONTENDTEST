"use client";

/**
 * Mentor course workspace for one course × division scope (from
 * `GET /me/teaching`). The selected scope and tab live in the URL so links
 * (e.g. from an assignment) open the right course.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { scopeKey, useTeachingScopes } from "@/lib/queries/mentor";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { ScopeSelect, parseScopeKey } from "../../components/mentorUi";
import OverviewTab from "./OverviewTab";
import ResourcesTab, { type ResourceKind } from "./ResourcesTab";
import DiscussionPanel from "@/app/components/discussions/DiscussionPanel";
import { useCourse } from "@/lib/queries/learning";
import { useSession } from "@/lib/auth/session";
import { useHeadedProgrammes } from "@/lib/queries/programmes";
import ProgrammeCourses from "../../programme/ProgrammeCourses";

type Tab = "overview" | ResourceKind | "discussion";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "books", label: "Books" },
  { id: "papers", label: "Past Papers" },
  { id: "notes", label: "Notes & Materials" },
  { id: "discussion", label: "Discussion" },
];

export default function CoursesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const scopes = useTeachingScopes();

  const tabParam = params.get("tab");
  const activeTab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "overview";
  const list = scopes.data ?? [];
  const requested = params.get("scope");
  const scope = list.find((s) => scopeKey(s) === requested) ?? list[0];

  const go = (next: { scope?: string; tab?: Tab }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.scope) sp.set("scope", next.scope);
    if (next.tab) sp.set("tab", next.tab);
    router.replace(`/mentor/courses?${sp.toString()}`, { scroll: false });
  };

  if (scopes.isPending) return <LoadingBlock label="Loading your courses…" />;
  if (scopes.isError)
    return (
      <div className="p-6 lg:p-10">
        <ErrorState error={scopes.error} title="Couldn't load your courses" onRetry={() => scopes.refetch()} />
      </div>
    );
  if (!scope) return <NoTeachingScope />;

  const sc = parseScopeKey(scopeKey(scope))!;

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 lg:p-10 font-sans text-slate-800">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{scope.course.title}</h1>
          <p className="text-sm text-gray-600 mt-1">{scope.division.name} division</p>
        </div>
        {list.length > 1 && <ScopeSelect scopes={list} value={scopeKey(scope)} onChange={(v) => go({ scope: v })} label="Course and division" />}
      </div>

      <div className="flex items-center gap-6 border-b border-slate-300/60 mb-6 text-sm font-medium overflow-x-auto" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => go({ tab: tab.id })}
            className={`pb-3 transition-colors relative whitespace-nowrap ${
              activeTab === tab.id ? "text-blue-600 font-semibold border-b-2 border-blue-600 -mb-[2px]" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <OverviewTab scope={scope} onOpenTab={(t) => go({ tab: t })} />
      ) : activeTab === "discussion" ? (
        <CourseDiscussion key={scopeKey(scope)} courseId={sc.courseId} divisionId={sc.divisionId} title={scope.course.title} division={scope.division.name} />
      ) : (
        <ResourcesTab key={`${scopeKey(scope)}:${activeTab}`} kind={activeTab} courseId={sc.courseId} divisionId={sc.divisionId} scopeKeyValue={scopeKey(scope)} />
      )}
    </div>
  );
}

/** The course × division discussion (mentors pass the division; the backend checks the scope). */
function CourseDiscussion({ courseId, divisionId, title, division }: { courseId: string; divisionId: string; title: string; division: string }) {
  const course = useCourse(courseId);
  return (
    <DiscussionPanel
      scope={{ kind: "course", courseId, divisionId }}
      banner={`Discussion for ${title} (${division} division). Students in this division can read and reply.`}
      disabledReason={course.data && !course.data.discussionsEnabled ? "Discussions are turned off for this course. You can still read earlier topics." : null}
    />
  );
}

/**
 * No course × division assignment. A Head Coach (reports.view, programme scope) sees the
 * courses of the programmes they head, read-only: GET /courses and the course pages
 * answer only for assigned courses (the backend's courses.view for a Head Coach covers
 * the programme list and reports, not course content). Anyone else: the empty state.
 */
function NoTeachingScope() {
  const { can } = useSession();
  const headed = useHeadedProgrammes();
  const headCoach = can("reports.view") && headed.programmes.length > 0;
  if (can("reports.view") && headed.loading) return <LoadingBlock label="Loading your courses…" />;
  return (
    <div className="p-6 lg:p-10 space-y-6">
      {headCoach ? (
        <>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Programme courses</h1>
            <p className="text-sm text-gray-600 mt-1">
              The courses of {headed.programmes.map((p) => p.name).join(", ")}. To prepare or review work in a course, an administrator gives you course access;
              participation per division and course analytics are under Programme → Courses.
            </p>
          </div>
          <ProgrammeCourses compact />
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState title="You are not assigned to a course yet" description="An administrator assigns coaches to a course and division." />
        </div>
      )}
    </div>
  );
}
