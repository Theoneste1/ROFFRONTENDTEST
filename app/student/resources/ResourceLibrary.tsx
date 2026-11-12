"use client";

/**
 * Student Mathematics resource library: every published resource of the
 * student's division across the Mathematics topics (Algebra, Geometry, Number
 * Theory, Combinatorics), by topic and kind (books, notes, past papers), with
 * search and filters kept in the URL.
 *
 * Access is decided by the backend, never widened here (lib/learning/library.ts):
 * students receive only their own division's published resources of published
 * courses; files open through the authenticated download
 * (`GET /courses/:id/resources/:rid/attachments/:aid/file`, FileButton), which
 * applies the same rules again.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpen, FileText, Lock, NotebookPen, Search, X } from "lucide-react";
import type { CourseResource } from "@/lib/api/types";
import { isApiError } from "@/lib/api/errors";
import { coursesApi } from "@/lib/api/learning";
import { useSession } from "@/lib/auth/session";
import { useMathLibrary } from "@/lib/queries/learning";
import {
  KIND_LABEL,
  TYPE_LABEL,
  countByKind,
  filterResources,
  kindOf,
  parseLibraryParams,
  topicLabel,
  yearsOf,
  type LibraryFilters,
  type ResourceKind,
} from "@/lib/learning/library";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import { FilterPills } from "@/app/components/ui/PageFrame";
import { courseStyle, divisionLabel } from "../components/studentUi";

const KIND_ICON: Record<ResourceKind, typeof BookOpen> = { books: BookOpen, notes: NotebookPen, papers: FileText };

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white border border-gray-100 shadow-sm">{children}</div>;
}

function AccessDenied({ title, body }: { title: string; body: string }) {
  return (
    <Panel>
      <div className="py-14 px-6 flex flex-col items-center text-center gap-2" role="alert" data-testid="library-denied">
        <Lock className="h-9 w-9 text-slate-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500 max-w-md">{body}</p>
      </div>
    </Panel>
  );
}

export default function ResourceLibrary() {
  const { user, can, permissionsStatus, retry } = useSession();
  // Nothing is requested until the permissions are known and include resources.view (the API enforces it too).
  const allowed = permissionsStatus === "ready" && can("resources.view");
  const lib = useMathLibrary(allowed);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const topics = lib.sections.map((s) => s.course);
  // The filters live in this component (read once from the URL, then mirrored to it), so quick
  // successive changes never start from a URL that hasn't caught up yet.
  const [chosen, setChosen] = useState<LibraryFilters>(() => parseLibraryParams(params, null));
  const filters: LibraryFilters = { ...chosen, topic: topics.some((c) => c.id === chosen.topic) ? chosen.topic : "" };
  const setFilters = (next: Partial<LibraryFilters>) => {
    const f = { ...chosen, ...next };
    setChosen(f);
    const sp = new URLSearchParams();
    if (f.topic) sp.set("topic", f.topic);
    if (f.kind) sp.set("kind", f.kind);
    if (f.q) sp.set("q", f.q);
    if (f.year !== null) sp.set("year", String(f.year));
    router.replace(sp.size ? `${pathname}?${sp}` : pathname, { scroll: false });
  };
  const anyFilter = !!(filters.topic || filters.kind || filters.q || filters.year !== null);

  // Topic narrows first (counts and years follow the chosen topic); then kind, year and search.
  const inTopic = filterResources(lib.resources, { topic: filters.topic, kind: "", q: "", year: null });
  const counts = countByKind(inTopic);
  const years = yearsOf(inTopic);
  const shown = filterResources(lib.resources, filters);

  const header = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">Mathematics resources</h1>
      <p className="mt-1 text-sm text-gray-500">
        {user?.division ? `${divisionLabel(user.division)} · ` : ""}Books, notes and past papers shared by your coaches.
      </p>
    </div>
  );

  if (permissionsStatus === "ready" && !can("resources.view")) {
    return (
      <div className="p-6">
        {header}
        <AccessDenied title="Resources aren't available to your account" body="Your account doesn't have access to learning resources. Contact an administrator if you think this is a mistake." />
      </div>
    );
  }

  if (permissionsStatus === "error") {
    return (
      <div className="p-6">
        {header}
        <ErrorState error={null} title="Couldn't check your access to resources" onRetry={retry} />
      </div>
    );
  }

  if (lib.courses.isError) {
    const noDivision = isApiError(lib.courses.error) && lib.courses.error.code === "NO_DIVISION";
    return (
      <div className="p-6">
        {header}
        {noDivision ? (
          <AccessDenied title="Your account has no division yet" body="Resources are shared by division (Junior S1–S3 or Senior S4–S6). An administrator needs to set your grade before you can see them." />
        ) : (
          <ErrorState error={lib.courses.error} title="Couldn't load the resource library" onRetry={() => lib.courses.refetch()} />
        )}
      </div>
    );
  }

  if (lib.courses.isPending) {
    return (
      <div className="p-6">
        {header}
        <LoadingBlock label="Loading resources…" />
      </div>
    );
  }

  if (topics.length === 0) {
    return (
      <div className="p-6">
        {header}
        <Panel>
          <EmptyState title="No Mathematics topics are available yet" description="Resources appear here once the Mathematics courses are published." />
        </Panel>
      </div>
    );
  }

  const visibleSections = lib.sections.filter((s) => !filters.topic || s.course.id === filters.topic);

  return (
    <div className="p-6">
      {header}

      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4 mb-6" data-testid="library-filters">
        <div className="relative">
          <label htmlFor="library-search" className="sr-only">
            Search resources
          </label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
          <input
            id="library-search"
            type="search"
            value={filters.q}
            maxLength={100}
            onChange={(e) => setFilters({ q: e.target.value })}
            placeholder="Search by title, author, description or tag…"
            className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
        <FilterPills
          label="Topic"
          value={filters.topic}
          onChange={(v) => setFilters({ topic: v, year: null })}
          options={[{ label: "All topics", value: "" }, ...topics.map((c) => ({ label: topicLabel(c), value: c.id }))]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <FilterPills
            label="Kind"
            value={filters.kind}
            onChange={(v) => setFilters({ kind: v as ResourceKind | "" })}
            options={[
              { label: "All kinds", value: "" as ResourceKind | "", count: inTopic.length },
              ...(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => ({ label: KIND_LABEL[k], value: k as ResourceKind | "", count: counts[k] })),
            ]}
          />
          {years.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              Year
              <select
                value={filters.year ?? ""}
                onChange={(e) => setFilters({ year: e.target.value ? Number(e.target.value) : null })}
                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Any year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
          {anyFilter && (
            <button type="button" onClick={() => setFilters({ topic: "", kind: "", q: "", year: null })} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>
      </div>

      {lib.loading ? (
        <LoadingBlock label="Loading resources…" />
      ) : (
        <>
          <p className="mb-4 text-xs text-gray-500" aria-live="polite" data-testid="library-count">
            {shown.length === 1 ? "1 resource" : `${shown.length} resources`}
            {anyFilter ? " match your filters" : ""}
          </p>
          {anyFilter && shown.length === 0 && visibleSections.every((s) => !s.query.isError) ? (
            <Panel>
              <EmptyState
                title="No resource matches your filters"
                description="Try another word, kind or topic."
                action={
                  <button type="button" onClick={() => setFilters({ topic: "", kind: "", q: "", year: null })} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                    Clear filters
                  </button>
                }
              />
            </Panel>
          ) : (
            <div className="space-y-8" data-testid="library-sections">
              {visibleSections.map(({ course, query }) => {
                const items = shown.filter((r) => r.courseId === course.id);
                if (anyFilter && items.length === 0 && !query.isError) return null;
                const style = courseStyle(course.code);
                return (
                  <section key={course.id} aria-labelledby={`topic-${course.id}`} data-testid={`topic-${course.code}`}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h2 id={`topic-${course.id}`} className="flex items-center gap-2 text-lg font-bold text-gray-900">
                        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-base font-black ${style.chip}`} aria-hidden="true">
                          {style.symbol}
                        </span>
                        {topicLabel(course)}
                        {query.isSuccess && <span className="text-xs font-medium text-gray-400">· {items.length}</span>}
                      </h2>
                      <Link href={`/student/courses/${course.id}`} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0">
                        Open course
                      </Link>
                    </div>
                    {query.isError ? (
                      isApiError(query.error) && query.error.status === 404 ? (
                        <p className="text-sm text-gray-500">This topic isn&apos;t available to your division right now.</p>
                      ) : (
                        <ErrorState error={query.error} title={`Couldn't load the ${topicLabel(course)} resources`} onRetry={() => query.refetch()} />
                      )
                    ) : items.length === 0 ? (
                      <p className="text-sm text-gray-500">No resources for this topic yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {items.map((r) => (
                          <ResourceCard key={r.id} resource={r} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResourceCard({ resource: r }: { resource: CourseResource }) {
  const kind = kindOf(r.type);
  const Icon = KIND_ICON[kind];
  const meta = [r.author && `By ${r.author}`, r.year && `${r.year}`, r.source].filter(Boolean).join(" · ");
  return (
    <article className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm min-w-0" data-testid="library-resource">
      <div className="flex items-start gap-3">
        <Icon className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900 break-words">{r.title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{TYPE_LABEL[r.type] ?? r.type}</span>
          </div>
          {meta && <p className="text-xs text-gray-500 mt-0.5">{meta}</p>}
          {r.description && <p className="mt-2 text-sm text-gray-600 whitespace-pre-line line-clamp-4">{r.description}</p>}
          {r.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <span key={t} className="text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {r.attachments.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {r.attachments.map((a) => (
            <FileButton key={a.id} file={a.file} fetchFile={() => coursesApi.resourceFile(r.courseId, r.id, a.id, a.file.originalName)} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">No file attached.</p>
      )}
    </article>
  );
}

