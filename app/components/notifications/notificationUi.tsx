"use client";

/**
 * Pieces shared by the bell dropdown, the inbox pages and the dashboard
 * widgets: category icons and labels, and the "open a notification" action
 * (marks it read, then follows its role-correct link).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, BookOpen, CheckCircle2, ClipboardCheck, FileText, MessageSquare, Trophy } from "lucide-react";
import type { AppNotification, NotificationCategory } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { notificationHref } from "@/lib/notifications/links";
import { useNotificationActions } from "@/lib/queries/community";

export const CATEGORY_META: Record<NotificationCategory, { label: string; icon: typeof Bell; tone: string }> = {
  ASSIGNMENTS: { label: "Assignments", icon: FileText, tone: "bg-indigo-50 text-indigo-600" },
  SUBMISSIONS: { label: "Submissions", icon: CheckCircle2, tone: "bg-green-50 text-green-600" },
  REVIEWS: { label: "Reviews", icon: ClipboardCheck, tone: "bg-orange-50 text-orange-600" },
  RESULTS: { label: "Results", icon: Trophy, tone: "bg-blue-50 text-blue-600" },
  RESOURCES: { label: "Resources", icon: BookOpen, tone: "bg-teal-50 text-teal-700" },
  DISCUSSIONS: { label: "Discussions", icon: MessageSquare, tone: "bg-purple-50 text-purple-600" },
  ACCOUNT: { label: "Account", icon: Bell, tone: "bg-slate-100 text-slate-600" },
};

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
