import type { Metadata } from "next";
import { Suspense } from "react";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import { LoadingBlock } from "@/app/components/ui/feedback";
import SubscribersAdmin from "./SubscribersAdmin";

export const metadata: Metadata = { title: "Subscribers" };

/** Administrators: the ROF news mailing list and its mailings (`/admin/subscribers`, subscribers.manage). */
export default function SubscribersPage() {
  return (
    <PermissionsGate>
      <Suspense fallback={<LoadingBlock />}>
        <SubscribersAdmin />
      </Suspense>
    </PermissionsGate>
  );
}
