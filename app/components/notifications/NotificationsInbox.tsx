"use client";

/**
 * The caller's notification inbox (all roles): All / Unread, category filter,
 * paging, mark read or unread, mark all read. Items open their role-correct
 * page and are marked read on the way.
 */
import { useState } from "react";
import { CheckCheck, ChevronRight, Mail, MailOpen } from "lucide-react";
import type { AppNotification, NotificationCategory } from "@/lib/api/types";
import { useNotificationActions, useNotifications, useUnreadCount } from "@/lib/queries/community";
import { formatDateTime, formatRelative } from "@/lib/format";
import { errorMessage } from "@/lib/api/errors";
import { Alert, EmptyState, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { FilterPills, PageFrame } from "@/app/components/ui/PageFrame";
import Pagination from "@/app/components/ui/Pagination";
import { CATEGORIES, CATEGORY_META, NotificationLink, useOpenNotification } from "./notificationUi";

const PAGE_SIZE = 20;
type Show = "all" | "unread";

export default function NotificationsInbox() {
  const [show, setShow] = useState<Show>("all");
  const [category, setCategory] = useState<NotificationCategory | "">("");
  const [page, setPage] = useState(1);
  const filters = { page, limit: PAGE_SIZE, ...(show === "unread" && { unreadOnly: true }), ...(category && { category }) };
  const list = useNotifications(filters);
  const count = useUnreadCount();
  const { markAllRead } = useNotificationActions();
  const unread = count.data?.unread ?? 0;

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <PageFrame
      title="Notifications"
      description={count.isPending ? "Loading…" : unread > 0 ? `${unread} unread` : "You're all caught up"}
      actions={
        unread > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            {markAllRead.isPending ? <Spinner className="h-4 w-4" /> : <CheckCheck className="h-4 w-4" />}
            Mark all as read
          </button>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <FilterPills<Show>
          label="Show"
          value={show}
          onChange={(v) => reset(() => setShow(v))}
          options={[
            { label: "All", value: "all" },
            { label: "Unread", value: "unread", count: count.data?.unread },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium">Category</span>
          <select
            value={category}
            onChange={(e) => reset(() => setCategory(e.target.value as NotificationCategory | ""))}
            className="bg-white border border-gray-200 rounded-xl py-2 px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            aria-label="Category"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c].label}
                {count.data && count.data.byCategory[c] > 0 ? ` (${count.data.byCategory[c]} unread)` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {markAllRead.isError && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(markAllRead.error)}</Alert>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
        {list.isPending ? (
          <LoadingBlock label="Loading notifications…" />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorState error={list.error} title="Couldn't load your notifications" onRetry={() => list.refetch()} />
          </div>
        ) : list.data.data.length === 0 ? (
          <EmptyState
            title={show === "unread" ? "No unread notifications" : category ? `No ${CATEGORY_META[category].label.toLowerCase()} notifications` : "No notifications yet"}
            description={show === "all" && !category ? "Updates about your work, reviews, results and discussions will appear here." : undefined}
          />
        ) : (
          <ul className={list.isFetching ? "opacity-70 transition-opacity" : ""}>
            {list.data.data.map((n) => (
              <InboxRow key={n.id} n={n} />
            ))}
          </ul>
        )}
      </div>

      {list.data && (
        <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
      )}
    </PageFrame>
  );
}

function InboxRow({ n }: { n: AppNotification }) {
  const { markRead, markUnread } = useNotificationActions();
  const { hrefOf } = useOpenNotification();
  const { icon: Icon, tone, label } = CATEGORY_META[n.category] ?? CATEGORY_META.ACCOUNT;
  const toggle = n.isRead ? markUnread : markRead;
  const href = hrefOf(n);

  return (
    <li className={`flex items-stretch gap-2 border-b border-gray-100 last:border-0 ${n.isRead ? "" : "bg-indigo-50/40"}`}>
      <NotificationLink notification={n} className={`flex-1 min-w-0 flex items-start gap-4 p-4 ${href ? "hover:bg-gray-50 transition-colors" : ""}`}>
        <span className={`p-2.5 rounded-xl shrink-0 ${tone}`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-sm ${n.isRead ? "font-medium text-gray-700" : "font-bold text-gray-900"}`}>{n.title}</span>
            {!n.isRead && <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">New</span>}
          </span>
          {n.body && <span className="block text-sm text-gray-600 mt-1 whitespace-pre-line break-words">{n.body}</span>}
          <span className="block text-xs text-gray-400 mt-1.5" title={formatDateTime(n.createdAt)}>
            {label} · {formatRelative(n.createdAt)}
          </span>
        </span>
        {href && <ChevronRight className="w-4 h-4 text-gray-300 self-center shrink-0" aria-hidden="true" />}
      </NotificationLink>
      <div className="flex flex-col items-center justify-center pr-3">
        <button
          type="button"
          onClick={() => toggle.mutate(n.id)}
          disabled={toggle.isPending}
          className="p-2 rounded-lg text-gray-400 hover:text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          title={n.isRead ? "Mark as unread" : "Mark as read"}
          aria-label={n.isRead ? "Mark as unread" : "Mark as read"}
        >
          {toggle.isPending ? <Spinner className="h-4 w-4" /> : n.isRead ? <Mail className="w-4 h-4" /> : <MailOpen className="w-4 h-4" />}
        </button>
        {toggle.isError && <span className="text-[10px] text-red-600 max-w-[80px] text-center">{errorMessage(toggle.error)}</span>}
      </div>
    </li>
  );
}
