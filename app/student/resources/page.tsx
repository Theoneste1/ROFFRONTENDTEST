import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import ResourceLibrary from "./ResourceLibrary";

export const metadata: Metadata = { title: "Mathematics resources" };

/** Student: the Mathematics resource library of their division (filters live in the URL). */
export default function StudentResourcesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ResourceLibrary />
    </Suspense>
  );
}
