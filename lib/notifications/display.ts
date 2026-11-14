/**
 * How a notification is shown (icon key and label) in the bell, the inbox and the dashboards.
 * Title and body always come from the backend; only the icon and the small label are chosen here
 * (unit-tested in tests/notifications.test.mjs).
 *
 * Most notifications are shown by their category. The decision notifications (an Administrator
 * approved or verified something, or granted permissions) get their own icon and label. Any type
 * or category this app does not know is still shown — as an Account notification.
 */
import type { NotificationCategory } from "../api/types";

/** The decision notifications sent after an Administrator's action has been saved. */
export const DECISION_NOTIFICATION_TYPES = {
  "school.request.verified": { visual: "SCHOOL_VERIFIED", label: "School verified" },
  "teacher.application.approved": { visual: "APPROVED", label: "Application approved" },
  "coach.application.approved": { visual: "APPROVED", label: "Application approved" },
  "permissions.granted": { visual: "PERMISSIONS", label: "Permissions" },
} as const;

export type DecisionVisual = (typeof DECISION_NOTIFICATION_TYPES)[keyof typeof DECISION_NOTIFICATION_TYPES]["visual"];
export type NotificationVisual = NotificationCategory | DecisionVisual;

export const CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> = {
  ASSIGNMENTS: "Assignments",
  SUBMISSIONS: "Submissions",
  REVIEWS: "Reviews",
  RESULTS: "Results",
  RESOURCES: "Resources",
  DISCUSSIONS: "Discussions",
  ACCOUNT: "Account",
};

export function isKnownCategory(c: unknown): c is NotificationCategory {
  return typeof c === "string" && Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, c);
}

/**
 * The icon key and label of a notification: its decision type when known, else its category,
 * else (an unknown category from a newer backend) Account.
 */
export function notificationVisual(n: { type?: string | null; category?: string | null }): { visual: NotificationVisual; label: string } {
  const type = n.type ?? "";
  if (Object.prototype.hasOwnProperty.call(DECISION_NOTIFICATION_TYPES, type)) {
    const d = DECISION_NOTIFICATION_TYPES[type as keyof typeof DECISION_NOTIFICATION_TYPES];
    return { visual: d.visual, label: d.label };
  }
  const category = isKnownCategory(n.category) ? n.category : "ACCOUNT";
  return { visual: category, label: CATEGORY_LABELS[category] };
}
