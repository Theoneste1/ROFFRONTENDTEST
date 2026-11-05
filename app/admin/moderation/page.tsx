import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import ModerationClient from "./ModerationClient";

export default function ModerationPage() {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      <Suspense fallback={<LoadingBlock />}>
        <ModerationClient />
      </Suspense>
    </div>
  );
}
