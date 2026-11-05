"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, ChevronRight, Search } from "lucide-react";
import { useMentorAssignments, useReviewQueue, useTeachingScopes } from "@/lib/queries/mentor";
import type { AssignmentStatus, MentorAssignment } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AssignmentStatusBadge, DONE_REVIEW_STATUSES, OPEN_REVIEW_STATUSES, ScopeSelect, parseScopeKey } from "../components/mentorUi";

type TabType = "all" | "drafts" | "pending" | "published" | "closed";

const TABS: { id: TabType; label: string; statuses?: AssignmentStatus[] }[] = [
  { id: "all", label: "All" },
  { id: "drafts", label: "Drafts", statuses: ["DRAFT", "REJECTED"] },
  { id: "pending", label: "Pending Approval", statuses: ["PENDING_APPROVAL"] },
  { id: "published", label: "Published", statuses: ["PUBLISHED"] },
  { id: "closed", label: "Closed", statuses: ["CLOSED", "ARCHIVED"] },
];

const PAGE_SIZE = 20;

/**
 * Assignments in the mentor's course × division scopes. The API filters by
 * one status at a time, so tabs that group two statuses (Drafts, Closed)
 * filter the loaded page.
 */
export default function AssignmentsDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [scope, setScope] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const scopes = useTeachingScopes();
  const tab = TABS.find((t) => t.id === activeTab)!;
  const sc = parseScopeKey(scope);
  const single = tab.statuses?.length === 1 ? tab.statuses[0] : undefined;
  const query = useMentorAssignments({
    courseId: sc?.courseId,
    divisionId: sc?.divisionId,
    status: single,
    q: search.trim() || undefined,
    page,
    limit: tab.statuses && !single ? 100 : PAGE_SIZE,
  });
  // The mentor's own review queue gives per-assignment review counts.
  const queue = useReviewQueue({ limit: 100 });

  const counts = useMemo(() => {
    const map = new Map<string, { toReview: number; done: number }>();
    for (const s of queue.data?.data ?? []) {
      const c = map.get(s.assignment.id) ?? { toReview: 0, done: 0 };
      if (OPEN_REVIEW_STATUSES.includes(s.status)) c.toReview++;
      else if (DONE_REVIEW_STATUSES.includes(s.status)) c.done++;
      map.set(s.assignment.id, c);
    }
    return map;
  }, [queue.data]);

  const rows = (query.data?.data ?? []).filter((a) => !tab.statuses || tab.statuses.includes(a.status));

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="min-h-screen p-4 md:p-10 font-sans text-slate-800 bg-[#E6EBF2]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Assignments</h1>
          <p className="text-slate-500 text-sm mt-1">Prepare assignments for your courses. An administrator publishes them to students.</p>
        </div>
        <Link
          href={sc ? `/mentor/assignments/create?scope=${encodeURIComponent(scope)}` : "/mentor/assignments/create"}
          className="inline-flex items-center justify-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white font-medium px-5 py-3 rounded-2xl shadow-sm transition-all text-sm w-fit"
        >
          <Plus className="w-5 h-5" />
          <span>Create Assignment</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6 max-w-5xl">
        {scopes.data && scopes.data.length > 0 && <ScopeSelect scopes={scopes.data} value={scope} onChange={(v) => reset(() => setScope(v))} includeAll />}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            placeholder="Search assignments..."
            aria-label="Search assignments"
            className="w-full pl-9 pr-4 py-2 bg-white rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6 overflow-x-auto">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => reset(() => setActiveTab(t.id))}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                activeTab === t.id ? "border-indigo-600 text-indigo-600 font-semibold" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="space-y-4 max-w-5xl">
        {query.isPending ? (
          <LoadingBlock label="Loading assignments…" />
        ) : query.isError ? (
          <ErrorState error={query.error} title="Couldn't load assignments" onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100">
            <EmptyState
              title={activeTab === "all" && !search && scope === "all" ? "No assignments yet" : "No assignments here"}
              description={activeTab === "all" && !search ? "Create your first assignment for one of your courses." : "Try another tab, course or search."}
            />
          </div>
        ) : (
          rows.map((item) => <AssignmentCard key={item.id} item={item} counts={counts.get(item.id)} />)
        )}
      </div>

      {query.data && (!tab.statuses || single) && (
        <div className="max-w-5xl">
          <Pagination page={page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} onPage={setPage} disabled={query.isFetching} />
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ item, counts }: { item: MentorAssignment; counts?: { toReview: number; done: number } }) {
  return (
    <Link
      href={`/mentor/assignments/${item.id}`}
      className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden"
    >
      <div className="flex items-center gap-4 min-w-0 md:min-w-[280px]">
        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900 text-base truncate">{item.title}</h3>
            <AssignmentStatusBadge status={item.status} />
          </div>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            {item.course.title} · {item.division.name} division
          </p>
          <p className="text-xs text-slate-400 mt-1">Due: {formatDateTime(item.deadline)}</p>
          {item.status === "REJECTED" && item.rejectionNote && (
            <p className="text-xs text-red-600 mt-1 line-clamp-2">Admin note: {item.rejectionNote}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between md:justify-end gap-8 w-full md:w-auto px-4 md:px-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
        <Metric value={item._count?.submissions ?? 0} label="Submitted" />
        <Metric value={counts?.done ?? 0} label="Reviewed" />
        <Metric value={counts?.toReview ?? 0} label="To review" />
        <ChevronRight className="w-6 h-6 text-slate-400 hidden md:block" />
      </div>
    </Link>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <span className="block text-lg font-bold text-slate-800">{value}</span>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}
