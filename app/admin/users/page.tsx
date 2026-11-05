import { Suspense } from "react";
import { LoadingBlock } from "@/app/components/ui/feedback";
import UsersTableClient from "./components/UsersTableClient";

export default function UsersPage() {
  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      <Suspense fallback={<LoadingBlock />}>
        <UsersTableClient />
      </Suspense>
    </div>
  );
}
