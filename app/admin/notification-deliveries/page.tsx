import type { Metadata } from "next";
import PermissionsGate from "@/app/components/auth/PermissionsGate";
import DeliveryLog from "./DeliveryLog";

export const metadata: Metadata = { title: "Notification deliveries" };

/** Administrators: delivery log of the decision notifications (`/admin/notification-deliveries`, email.bulkSend). */
export default function NotificationDeliveriesPage() {
  return (
    <PermissionsGate>
      <DeliveryLog />
    </PermissionsGate>
  );
}
