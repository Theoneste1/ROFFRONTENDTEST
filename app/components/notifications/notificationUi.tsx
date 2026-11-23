"use client";

/**
 * Pieces shared by the bell dropdown, the inbox pages and the dashboard
 * widgets: category icons and labels, and the "open a notification" action
 * (marks it read, then follows its role-correct link). Which icon / label a
 * notification gets (its decision type, else its category, else Account) is
 * decided in lib/notifications/display.ts.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { BadgeCheck, Bell, BookOpen, CheckCircle2, ClipboardCheck, FileText, KeyRound, MessageSquare, School, Trophy } from "lucide-react";
import type { AppNotification, NotificationCategory } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { notificationHref } from "@/lib/notifications/links";
import { CATEGORY_LABELS, notificationVisual, type DecisionVisual } from "@/lib/notifications/display";
import { useNotificationActions } from "@/lib/queries/community";

type Meta = { label: string; icon: typeof Bell; tone: string };

export const CATEGORY_META: Record<NotificationCategory, Meta> = {
  ASSIGNMENTS: { label: CATEGORY_LABELS.ASSIGNMENTS, icon: FileText, tone: "bg-indigo-50 text-indigo-600" },
  SUBMISSIONS: { label: CATEGORY_LABELS.SUBMISSIONS, icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
  REVIEWS: { label: CATEGORY_LABELS.REVIEWS, icon: ClipboardCheck, tone: "bg-orange-50 text-orange-600" },
  RESULTS: { label: CATEGORY_LABELS.RESULTS, icon: Trophy, tone: "bg-blue-50 text-blue-600" },
  RESOURCES: { label: CATEGORY_LABELS.RESOURCES, icon: BookOpen, tone: "bg-teal-50 text-teal-700" },
  DISCUSSIONS: { label: CATEGORY_LABELS.DISCUSSIONS, icon: MessageSquare, tone: "bg-purple-50 text-purple-600" },
  ACCOUNT: { label: CATEGORY_LABELS.ACCOUNT, icon: Bell, tone: "bg-slate-100 text-slate-600" },
};

/** Icons of the decision notifications (school verified, application approved, permissions granted). */
const DECISION_META: Record<DecisionVisual, Omit<Meta, "label">> = {
  SCHOOL_VERIFIED: { icon: School, tone: "bg-emerald-50 text-emerald-700" },
  APPROVED: { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-700" },
  PERMISSIONS: { icon: KeyRound, tone: "bg-amber-50 text-amber-700" },
};

/** Icon, tone and label of one notification; unknown types and categories render as Account. */
export function notificationMeta(n: Pick<AppNotification, "type" | "category">): Meta {
  const { visual, label } = notificationVisual(n);
  const base = visual in DECISION_META ? DECISION_META[visual as DecisionVisual] : CATEGORY_META[visual as NotificationCategory];
  return { ...base, label };
}

export const CATEGORIES = Object.keys(CATEGORY_META) as NotificationCategory[];

/** Destination for the signed-in role, and an `onOpen` that marks the item read. */
export function useOpenNotification() {
  const { role } = useSession();
  const { markRead } = useNotificationActions();
  return {
    hrefOf: (n: AppNotification) => (role ? notificationHref(n, role) : null),
    onOpen: (n: AppNotification) => {
      if (!n.isRead) markRead.mutate(n.id);
    },
  };
}

/**
 * Wraps a notification's content in a link when it has a destination for this
 * role; otherwise renders it as plain content.
 */
export function NotificationLink({
  notification,
  className,
  onNavigate,
  children,
}: {
  notification: AppNotification;
  className?: string;
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const { hrefOf, onOpen } = useOpenNotification();
  const href = hrefOf(notification);
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link
      href={href}
      className={className}
      data-notification-id={notification.id}
      onClick={() => {
        onOpen(notification);
        onNavigate?.();
      }}
    >
      {children}
    </Link>
  );
}
