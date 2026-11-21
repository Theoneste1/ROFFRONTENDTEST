import type { Metadata } from "next";
import { Suspense } from "react";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { LoadingBlock } from "@/app/components/ui/feedback";
import BulkRecordsClient from "./BulkRecordsClient";

export const metadata: Metadata = { title: "Bulk operations" };

/** Administrators: progress and per-record results of bulk operations on every record type (users.bulkManage). */
export default function BulkRecordsPage() {
  return (
    <PermissionsGate>
      <Suspense fallback={<LoadingBlock />}>
        <BulkRecordsClient />
      </Suspense>
    </PermissionsGate>
  );
}
