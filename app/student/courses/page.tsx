"use client";

import Link from "next/link";
import { ChevronRight, GitFork, Layers } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useCourses } from "@/lib/queries/learning";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { courseStyle, divisionLabel } from "../components/studentUi";

/** The four courses of the student's division (published only; enforced by the API). */
export default function CoursesPage() {
  const { user } = useSession();
  const courses = useCourses();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
      {user?.division && <p className="mt-1 mb-6 text-sm text-gray-500">{divisionLabel(user.division)}</p>}

      {courses.isPending ? (
        <LoadingBlock label="Loading courses…" />
      ) : courses.isError ? (
        <ErrorState error={courses.error} title="Couldn't load courses" onRetry={() => courses.refetch()} />
      ) : courses.data.length === 0 ? (
        <div className="rounded-2xl bg-white border border-gray-100">
          <EmptyState title="No courses are available yet" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {courses.data.map((course) => {
            const style = courseStyle(course.code);
            const href = `/student/courses/${course.id}`;
            return (
              <div key={course.id} className="relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                {/* Banner */}
                <Link href={href} aria-label={course.title}>
                  <div className={`relative flex h-36 w-full items-end justify-between rounded-xl bg-gradient-to-r ${style.banner} p-3 hover:opacity-90 transition-opacity`}>
                    <span className="text-4xl font-black text-white/80 leading-none">{style.symbol}</span>
                    <span className="text-xs font-medium text-white/90">
                      {course.counts.resources} resources · {course.counts.assignments} assignments
                    </span>
                  </div>
                </Link>

                {/* Title & description */}
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={href}>
                      <h2 className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors">{course.title}</h2>
                    </Link>
                    {course.displayStatus && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{course.displayStatus}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{course.description}</p>
                </div>

                <hr className="my-4 border-gray-200" />

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-700 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-800"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    Continue Learning
                  </Link>
                  <Link
                    href={`${href}?tab=papers`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    <GitFork className="h-3.5 w-3.5 text-indigo-600" />
                    Practice
                  </Link>
                  <Link
                    href={`${href}?tab=books`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-blue-100"
                  >
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    Resources
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
