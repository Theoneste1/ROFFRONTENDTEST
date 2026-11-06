import type { Metadata } from "next";
import NotificationsInbox from "@/app/components/notifications/NotificationsInbox";

export const metadata: Metadata = { title: "Notifications" };

/** The signed-in user's notifications (`GET /notifications`). */
export default function NotificationsPage() {
  return <NotificationsInbox />;
}
