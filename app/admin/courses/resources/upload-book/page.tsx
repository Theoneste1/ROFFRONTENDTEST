import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import AdminResourceForm from "./AdminResourceForm";

export const metadata: Metadata = { title: "Upload resource" };

/** Create or edit a resource in any course × division (mentor upload form, reused). */
export default function AdminUploadResourcePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AdminResourceForm />
    </Suspense>
  );
}
