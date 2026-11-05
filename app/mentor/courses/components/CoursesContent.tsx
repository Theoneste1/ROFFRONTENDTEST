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

type Tab = "overview" | ResourceKind;
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "books", label: "Books" },
  { id: "papers", label: "Past Papers" },
  { id: "notes", label: "Notes & Materials" },
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
  if (!scope)
    return (
      <div className="p-6 lg:p-10">
        <div className="bg-white rounded-2xl border border-slate-200">
          <EmptyState title="You are not assigned to a course yet" description="An administrator assigns mentors to a course and division." />
        </div>
      </div>
    );

  const sc = parseScopeKey(scopeKey(scope))!;

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 lg:p-10 font-sans text-slate-800">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{scope.course.title}</h1>
          <p className="text-sm text-gray-500 mt-1">{scope.division.name} division</p>
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
              activeTab === tab.id ? "text-blue-600 font-semibold border-b-2 border-blue-600 -mb-[2px]" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" ? (
        <OverviewTab scope={scope} onOpenTab={(t) => go({ tab: t })} />
      ) : (
        <ResourcesTab key={`${scopeKey(scope)}:${activeTab}`} kind={activeTab} courseId={sc.courseId} divisionId={sc.divisionId} scopeKeyValue={scopeKey(scope)} />
      )}
    </div>
  );
}
