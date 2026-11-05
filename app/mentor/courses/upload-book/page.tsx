import type { Metadata } from "next";
import { Suspense } from "react";
import ResourceForm from "./ResourceForm";
import { LoadingBlock } from "@/app/components/ui/feedback";

export const metadata: Metadata = { title: "Upload resource" };

/** Create or edit a course resource (book, e-book, past paper, note, attachment). */
export default function UploadResourcePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <ResourceForm />
    </Suspense>
  );
}
