import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import AdminResources from "./AdminResources";

export const metadata: Metadata = { title: "Course resources" };

export default function AdminResourcesPage() {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      <Suspense fallback={<LoadingBlock />}>
        <AdminResources />
      </Suspense>
    </div>
  );
}
