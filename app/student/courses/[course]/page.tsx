import type { Metadata } from "next";
import { Suspense } from "react";
import CourseDetail from "./CourseDetail";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Course" };

export default async function CoursePage({ params }: PageProps<"/student/courses/[course]">) {
  const { course } = await params;
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CourseDetail courseId={course} />
    </Suspense>
  );
}
