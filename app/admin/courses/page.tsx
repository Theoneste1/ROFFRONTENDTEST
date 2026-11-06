"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { COURSE_RULES } from "@/lib/api/admin";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import type { Course, CourseStatus } from "@/lib/api/types";
import { useActiveScopes, useAdminDashboard, useCourseAction, useCourseParticipation } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";
import { formatNumber } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { ConfirmDialog, MetricCard } from "../components/adminUi";

const STATUS: Record<CourseStatus, { label: string; badge: string }> = {
  PUBLISHED: { label: "Published", badge: "bg-emerald-50 text-emerald-700" },
  DRAFT: { label: "Unpublished", badge: "bg-gray-100 text-gray-500" },
  ARCHIVED: { label: "Archived", badge: "bg-amber-50 text-amber-700" },
};

type StateAction = "publish" | "unpublish" | "archive";

const STATE_CONFIRM: Record<StateAction, { title: string; body: string; label: string; danger?: boolean }> = {
  publish: { title: "Publish this course?", body: "Students of both divisions see the course and its published content.", label: "Publish" },
  unpublish: { title: "Unpublish this course?", body: "All of its content (resources, assignments, discussions) is hidden from students and new submissions are blocked. Nothing is deleted.", label: "Unpublish", danger: true },
  archive: { title: "Archive this course?", body: "The course is hidden from students and stops taking new work. Content, results and history are kept, and it can be published again.", label: "Archive", danger: true },
};

function EditCourseModal({ course, onClose }: { course: Course; onClose: () => void }) {
  const action = useCourseAction();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [discussions, setDiscussions] = useState(course.discussionsEnabled);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<StateAction | null>(null);
  const server = fieldErrors(action.error, ["title", "description"]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const d = description.trim();
    if (t.length < COURSE_RULES.title.min || t.length > COURSE_RULES.title.max) return setError("The title must be 3–200 characters.");
    if (d.length < COURSE_RULES.description.min || d.length > COURSE_RULES.description.max) return setError("The description must be 10–2,000 characters.");
    const input: { title?: string; description?: string; discussionsEnabled?: boolean } = {};
    if (t !== course.title) input.title = t;
    if (d !== (course.description ?? "")) input.description = d;
    if (discussions !== course.discussionsEnabled) input.discussionsEnabled = discussions;
    if (!Object.keys(input).length) return setError("Nothing has changed.");
    setError(null);
    try {
      await action.mutateAsync({ type: "update", id: course.id, input });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const stateActions: StateAction[] = [...(course.status !== "PUBLISHED" ? (["publish"] as const) : (["unpublish"] as const)), ...(course.status !== "ARCHIVED" ? (["archive"] as const) : [])];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-labelledby="edit-course-title">
      <form onSubmit={save} className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4">
          <h2 id="edit-course-title" className="text-xl font-bold text-gray-900">
            Edit {course.title}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 pt-2">
          <div>
            <label htmlFor="course-title" className="block text-xs font-medium text-gray-700 mb-2">
              Course title
            </label>
            <input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={COURSE_RULES.title.max} className="w-full text-xs text-gray-800 bg-white border border-gray-200 rounded-2xl p-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
            {server.title && <p className="mt-1 text-[11px] text-red-600">{server.title}</p>}
          </div>
          {/* Course Description */}
          <div>
            <label htmlFor="course-desc" className="block text-xs font-medium text-gray-700 mb-2">
              Course description
            </label>
            <textarea
              id="course-desc"
              rows={3}
              value={description}
              maxLength={COURSE_RULES.description.max}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full text-xs text-gray-800 bg-white border border-indigo-500/80 rounded-2xl p-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all resize-none"
            />
            {server.description && <p className="mt-1 text-[11px] text-red-600">{server.description}</p>}
          </div>

          {/* Discussions switch (real backend setting) */}
          <div className="bg-gray-50/70 rounded-2xl p-4 flex items-center justify-between border border-gray-100">
            <div>
              <h3 className="text-xs font-semibold text-gray-900">Course discussions</h3>
              <p className="text-[11px] text-gray-400 mt-0.5 font-medium">Students and coaches can post in this course&apos;s discussion threads.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={discussions}
              aria-label="Course discussions"
              onClick={() => setDiscussions((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${discussions ? "bg-indigo-600" : "bg-gray-300"}`}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${discussions ? "translate-x-4" : "translate-x-0"}`} />
            </button>
          </div>

          {/* Visibility: publish / unpublish / archive */}
          <div className="bg-gray-50/70 rounded-2xl p-4 border border-gray-100">
            <h3 className="text-xs font-semibold text-gray-900">
              Course visibility · <span className="font-medium text-gray-500">{STATUS[course.status].label}</span>
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5 font-medium mb-3">Unpublished and archived courses are hidden from students. Both divisions always study all four courses.</p>
            <div className="flex flex-wrap gap-2">
              {stateActions.map((a) => (
                <button key={a} type="button" onClick={() => setConfirm(a)} className={`px-4 py-1.5 text-xs font-semibold rounded-xl border ${STATE_CONFIRM[a].danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-indigo-200 text-indigo-700 hover:bg-indigo-50"}`}>
                  {STATE_CONFIRM[a].label}
                </button>
              ))}
            </div>
          </div>
          {error && <Alert tone={error === "Nothing has changed." ? "info" : "error"}>{error}</Alert>}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 mt-8">
          <button type="button" onClick={onClose} className="px-5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-medium rounded-xl transition-colors shadow-2xs cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={action.isPending} className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50">
            {action.isPending && action.variables?.type === "update" && <Spinner className="h-3.5 w-3.5 !text-white" />}
            Save changes
          </button>
        </div>
      </form>
      {confirm && (
        <ConfirmDialog
          title={STATE_CONFIRM[confirm].title}
          body={STATE_CONFIRM[confirm].body}
          confirmLabel={STATE_CONFIRM[confirm].label}
          tone={STATE_CONFIRM[confirm].danger ? "danger" : "primary"}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await action.mutateAsync({ type: "state", id: course.id, action: confirm });
            onClose();
          }}
        />
      )}
    </div>
  );
}

export default function CoursesWithEditModal() {
  const courses = useCourses();
  const participation = useCourseParticipation();
  const dashboard = useAdminDashboard();
  const scopes = useActiveScopes();
  const [editing, setEditing] = useState<Course | null>(null);

  const rowsFor = (courseId: string) => participation.data?.rows.filter((r) => r.course.id === courseId) ?? [];
  const studentsFor = (courseId: string) => (participation.data ? rowsFor(courseId).reduce((n, r) => n + r.students, 0) : undefined);
  const mentorsFor = (courseId: string) => (scopes.data ? new Set(scopes.data.filter((s) => s.course.id === courseId).map((s) => s.mentor.id)).size : undefined);
  const allMentors = scopes.data ? new Set(scopes.data.map((s) => s.mentor.id)).size : undefined;
  const list = courses.data ?? [];
  const dash = (v: number | undefined) => (v === undefined ? "…" : formatNumber(v));

  return (
    <div className="relative min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Courses</h1>
        <p className="text-sm text-gray-500 mt-1 font-medium">The Mathematics curriculum is fixed to four areas: Algebra, Geometry, Number Theory and Combinatorics.</p>
      </div>

      {/* Top Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Published courses" value={courses.data ? list.filter((c) => c.status === "PUBLISHED").length : "…"} subtext={`Of ${list.length || 4} curriculum areas`} />
        <MetricCard label="Students" value={dash(dashboard.data?.students.total)} subtext="Across both divisions" />
        <MetricCard label="Assigned coaches" value={dash(allMentors)} subtext="With course access" />
        <MetricCard label="Open assignments" value={dash(dashboard.data?.assignments.published)} subtext="Currently accepting submissions" />
      </div>

      {/* Courses Table */}
      {courses.isPending ? (
        <LoadingBlock />
      ) : courses.isError ? (
        <ErrorState error={courses.error} title="Couldn't load courses" onRetry={() => courses.refetch()} />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500">Course</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500">Division</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500">Students</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500">Coaches</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 sm:px-6 py-4 text-xs font-semibold text-gray-500 text-right sm:pr-10">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/80">
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                    <td className="px-4 sm:px-6 py-4 font-bold text-gray-900 whitespace-nowrap">
                      {c.title}
                      {!c.discussionsEnabled && <span className="block text-[11px] font-normal text-gray-400">Discussions off</span>}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 font-medium whitespace-nowrap">Junior &amp; Senior</td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 font-medium">{dash(studentsFor(c.id))}</td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 font-medium">{dash(mentorsFor(c.id))}</td>
                    <td className="px-4 sm:px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-[11px] font-semibold ${STATUS[c.status].badge}`}>{STATUS[c.status].label}</span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right sm:pr-10">
                      <div className="inline-flex items-center gap-4">
                        <Link href={`/admin/courses/resources?scope=${c.id}`} className="text-gray-700 hover:text-gray-900 font-medium transition-colors whitespace-nowrap" aria-label={`Resources of ${c.title}`}>
                          Resources
                        </Link>
                        <button type="button" onClick={() => setEditing(c)} className="text-gray-700 hover:text-gray-900 font-medium transition-colors cursor-pointer" aria-label={`Edit ${c.title}`}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <EditCourseModal course={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
