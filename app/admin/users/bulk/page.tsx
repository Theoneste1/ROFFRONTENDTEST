import type { Metadata } from "next";
import { Suspense } from "react";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { LoadingBlock } from "@/app/components/ui/feedback";
import BulkOperationsClient from "./BulkOperationsClient";

export const metadata: Metadata = { title: "Bulk operations" };

/** Administrators: progress and per-account results of bulk user operations (users.bulkManage). */
export default function BulkOperationsPage() {
  return (
    <PermissionsGate>
      <Suspense fallback={<LoadingBlock />}>
        <BulkOperationsClient />
      </Suspense>
    </PermissionsGate>
  );
}
