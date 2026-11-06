"use client";

/**
 * Navbar bell: unread badge (`GET /notifications/unread-count`, polled every
 * 60 s while the tab is visible) and a dropdown with the latest notifications.
 * The backend has no push channel, so opening the dropdown also refreshes it.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { portalPath } from "@/lib/auth/roles";
import { useNotificationActions, useNotifications, useUnreadCount } from "@/lib/queries/community";
import { formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/api/errors";
import { Spinner } from "@/app/components/ui/feedback";
import { CATEGORY_META, NotificationLink } from "./notificationUi";

const PREVIEW = 6;

export default function NotificationBell() {
  const { role } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const count = useUnreadCount();
  const latest = useNotifications({ limit: PREVIEW }, open);
  const { markAllRead } = useNotificationActions();
  const unread = count.data?.unread ?? 0;

  // Close on outside click and Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close after navigating (e.g. "View all").
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  if (!role) return null;
  const inbox = portalPath(role, "notifications");
  const items = latest.data?.data ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          if (!open) void count.refetch();
          setOpen((o) => !o);
        }}
        className="relative p-1.5 rounded-lg hover:bg-gray-200/50 transition-colors"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5 text-gray-700" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-[18px] text-center"
            data-testid="unread-badge"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed left-4 right-4 top-20 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 overflow-hidden"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div>
              <p className="font-bold text-gray-900 text-sm">Notifications</p>
              <p className="text-xs text-gray-500">{unread > 0 ? `${unread} unread` : "You're all caught up"}</p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {markAllRead.isPending ? <Spinner className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />}
                Mark all read
              </button>
            )}
          </div>
          {markAllRead.isError && <p className="px-4 py-2 text-xs text-red-600">{errorMessage(markAllRead.error)}</p>}

          <div className="max-h-[60vh] overflow-y-auto">
            {latest.isPending ? (
              <div className="py-8 flex justify-center">
                <Spinner />
              </div>
            ) : latest.isError ? (
              <p className="px-4 py-6 text-sm text-red-600">{errorMessage(latest.error)}</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-gray-500 text-center">No notifications yet.</p>
            ) : (
              <ul>
                {items.map((n) => {
                  const { icon: Icon, tone } = CATEGORY_META[n.category] ?? CATEGORY_META.ACCOUNT;
                  return (
                    <li key={n.id} className="border-b border-gray-50 last:border-0">
                      <NotificationLink
                        notification={n}
                        onNavigate={() => setOpen(false)}
                        className={`flex items-start gap-3 px-4 py-3 ${n.isRead ? "" : "bg-indigo-50/40"} hover:bg-gray-50 transition-colors`}
                      >
                        <span className={`p-2 rounded-xl shrink-0 ${tone}`}>
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${n.isRead ? "font-medium text-gray-700" : "font-bold text-gray-900"}`}>{n.title}</span>
                          {n.body && <span className="block text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</span>}
                          <span className="block text-[11px] text-gray-400 mt-1">{formatRelative(n.createdAt)}</span>
                        </span>
                        {!n.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-indigo-600 shrink-0" aria-label="Unread" />}
                      </NotificationLink>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Link href={inbox} className="block text-center px-4 py-3 text-sm font-semibold text-indigo-600 hover:bg-gray-50 border-t border-gray-100">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
