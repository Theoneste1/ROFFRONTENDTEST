import type { Metadata } from "next";
import { Suspense } from "react";
import CreateAssignment from "./CreateAssignment";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Create assignment" };

export default function CreateAssignmentPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CreateAssignment />
    </Suspense>
  );
}
