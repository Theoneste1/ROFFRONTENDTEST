"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, FileText, MessageSquare, NotebookPen } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useCompleteCourse, useCourse, useCourseResources } from "@/lib/queries/learning";
import { coursesApi } from "@/lib/api/learning";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";
import type { CourseResource, ResourceType } from "@/lib/api/types";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import FileButton from "@/app/components/ui/FileButton";
import DiscussionPanel from "@/app/components/discussions/DiscussionPanel";
import { divisionLabel } from "../../components/studentUi";

type Tab = "overview" | "books" | "papers" | "notes" | "discussion";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "books", label: "Books" },
  { id: "papers", label: "Past Papers" },
  { id: "notes", label: "Notes & Materials" },
  { id: "discussion", label: "Discussion" },
];

/** Resource types shown on each tab (backend ResourceType). */
const TAB_TYPES: Record<"books" | "papers" | "notes", ResourceType[]> = {
  books: ["BOOK", "EBOOK"],
  papers: ["PAST_PAPER"],
  notes: ["NOTE", "ATTACHMENT"],
};

function tabForType(type: ResourceType): Tab {
  return (Object.keys(TAB_TYPES) as (keyof typeof TAB_TYPES)[]).find((k) => TAB_TYPES[k].includes(type)) ?? "overview";
}

function parseTab(value: string | null): Tab {
  if (value === "practice") return "papers"; // older links
  return TABS.some((t) => t.id === value) ? (value as Tab) : "overview";
}

export default function CourseDetail({ courseId }: { courseId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useSession();

  const course = useCourse(courseId);
  const resources = useCourseResources(courseId);

  // `?resource=<id>` (from a "new material" notification): open that resource's tab and highlight it.
  const focusId = params.get("resource");
  const focused = focusId ? (resources.data ?? []).find((r) => r.id === focusId) : undefined;
  const focusMissing = !!focusId && resources.isSuccess && !focused;
  const tab = params.get("tab") ? parseTab(params.get("tab")) : focused ? tabForType(focused.type) : "overview";
  const complete = useCompleteCourse(courseId);

  const setTab = (t: Tab) => router.replace(`/student/courses/${courseId}?tab=${t}`, { scroll: false });

  if (course.isPending) return <LoadingBlock label="Loading course…" />;

  if (course.isError) {
    const notFound = isApiError(course.error) && (course.error.status === 404 || course.error.status === 400);
    return (
      <div className="p-8 space-y-6">
        <Link href="/student/courses" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back to courses
        </Link>
        {notFound ? (
          <div className="bg-white rounded-2xl border border-gray-100">
            <EmptyState title="Course not found" description="This course doesn't exist or isn't available to you." />
          </div>
        ) : (
          <ErrorState error={course.error} title="Couldn't load this course" onRetry={() => course.refetch()} />
        )}
      </div>
    );
  }

  const c = course.data;
  const all = resources.data ?? [];
  const byType = (types: ResourceType[]) => all.filter((r) => types.includes(r.type));
  const completed = c.enrollmentStatus === "COMPLETED";

  return (
    <div className="relative min-h-screen p-4 md:p-8 text-gray-900">
      <Link href="/student/courses" className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </Link>

      {/* Course header */}
      <div className="mt-6">
        <h1 className="text-4xl font-bold tracking-tight">{c.title}</h1>
        <p className="mt-2 text-lg text-gray-600 max-w-2xl">{c.description}</p>
      </div>

      {focusMissing && (
        <div className="mt-6 max-w-2xl">
          <Alert tone="info">The material from your notification is no longer available. It may have been unpublished or archived.</Alert>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-6 md:gap-8 border-b border-gray-200 text-sm font-medium overflow-x-auto" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`pb-3 whitespace-nowrap transition-colors ${
              tab === t.id ? "border-b-2 border-indigo-600 font-semibold text-indigo-600" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8 min-w-0">
          {tab === "overview" && (
            <>
              <div>
                <h2 className="text-lg font-bold">About this subject</h2>
                <p className="mt-2 text-gray-600 leading-relaxed">{c.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Division</p>
                  <p className="mt-1 font-medium text-gray-800">{divisionLabel(user?.division) || "—"}</p>

                  <p className="mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Discipline</p>
                  <p className="mt-1 font-medium text-gray-800">{c.discipline.name}</p>

                  <p className="mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Assignments</p>
                  <p className="mt-1 font-medium text-gray-800">{c.counts.assignments}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Your Progress</p>
                  <p className="mt-1 font-medium text-gray-800">{c.displayStatus ?? "—"}</p>

                  <p className="mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Resources</p>
                  <p className="mt-1 font-medium text-gray-800">
                    {byType(TAB_TYPES.books).length} books · {byType(TAB_TYPES.papers).length} papers · {byType(TAB_TYPES.notes).length} notes
                  </p>

                  <p className="mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Discussion</p>
                  <p className="mt-1 font-medium text-gray-800">{c.discussionsEnabled ? "Open" : "Turned off"}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4">How to get started</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                  {["Start with the recommended book.", "Study the notes and examples.", "Practice with past papers regularly.", "Attempt assignments and ask questions."].map(
                    (step, i) => (
                      <div key={step} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-indigo-700">{i + 1}</span>
                        <p>{step}</p>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </>
          )}

          {(tab === "books" || tab === "papers" || tab === "notes") && (
            <ResourceList
              title={tab === "books" ? "Recommended Books" : tab === "papers" ? "Past Exam Papers" : "Notes & Materials"}
              empty={tab === "books" ? "No books available for this subject yet." : tab === "papers" ? "No past papers uploaded yet." : "No notes or materials uploaded yet."}
              icon={tab === "books" ? BookOpen : tab === "papers" ? FileText : NotebookPen}
              query={resources}
              items={byType(TAB_TYPES[tab])}
              courseId={courseId}
              highlightId={focused?.id}
            />
          )}

          {tab === "discussion" && (
            <DiscussionPanel
              scope={{ kind: "course", courseId }}
              banner={`Discussion for ${c.title} (${user?.division?.name ?? "your"} division). Ask questions and help each other — be respectful!`}
              disabledReason={c.discussionsEnabled ? null : "Discussions are turned off for this course. You can still read earlier topics."}
            />
          )}
        </div>

        {/* Side card (replaces the mock mentor card; the API has no per-course mentor profile) */}
        <div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-6">
            <h3 className="font-bold text-gray-900">Your progress</h3>

            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full font-bold ${completed ? "bg-green-100 text-green-700" : "bg-indigo-100 text-indigo-700"}`}>
                {completed ? <CheckCircle2 className="h-6 w-6" /> : c.title.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-gray-900">{c.displayStatus ?? "—"}</p>
                <p className="text-xs text-gray-500">{completed && c.completedAt ? `Completed ${formatDate(c.completedAt)}` : c.title}</p>
              </div>
            </div>

            {complete.isError && <Alert tone="error">{errorMessage(complete.error)}</Alert>}
            {!completed && (
              <button
                type="button"
                onClick={() => complete.mutate()}
                disabled={complete.isPending}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-700 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-800 disabled:opacity-60"
              >
                {complete.isPending ? <Spinner className="h-4 w-4 !text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                Mark course as completed
              </button>
            )}

            <button
              type="button"
              onClick={() => setTab("discussion")}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-blue-50/50 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-blue-100"
            >
              <MessageSquare className="h-4 w-4" /> Ask a question
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceList({
  title,
  empty,
  icon: Icon,
  query,
  items,
  courseId,
  highlightId,
}: {
  title: string;
  empty: string;
  icon: typeof BookOpen;
  query: ReturnType<typeof useCourseResources>;
  items: CourseResource[];
  courseId: string;
  highlightId?: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {query.isPending ? (
        <LoadingBlock label="Loading resources…" />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Couldn't load resources" onRetry={() => query.refetch()} />
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        items.map((r) => (
          <div
            key={r.id}
            id={`resource-${r.id}`}
            ref={r.id === highlightId ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
            aria-current={r.id === highlightId ? "true" : undefined}
            className={`rounded-xl border bg-white p-4 shadow-sm ${r.id === highlightId ? "border-indigo-400 ring-2 ring-indigo-200" : "border-gray-100"}`}
          >
            <div className="flex items-start gap-4">
              <Icon className="h-6 w-6 text-indigo-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{r.title}</p>
                <p className="text-xs text-gray-500">
                  {[r.author && `By ${r.author}`, r.year && `Year: ${r.year}`, r.source].filter(Boolean).join(" · ")}
                </p>
                {r.description && <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{r.description}</p>}
                {r.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.tags.map((t) => (
                      <span key={t} className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
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
                  <FileButton key={a.id} file={a.file} fetchFile={() => coursesApi.resourceFile(courseId, r.id, a.id, a.file.originalName)} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-400">No file attached.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
