import type { Metadata } from "next";
import { Suspense } from "react";
import CoursesContent from "./components/CoursesContent";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Courses" };

export default function MentorCoursesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CoursesContent />
    </Suspense>
  );
}
