"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ACTIVITY_LABEL, ACTIVITY_TYPES, activityQuery, isUuid, type ActivityType } from "@/lib/admin-ops/activity";
import { useActivity, useActivitySummary } from "@/lib/queries/admin-ops";
import { useCourses } from "@/lib/queries/learning";
import { roleLabel } from "@/lib/auth/roles";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, MetricCard, RequirePermission, SelectFilter, TableCard, TableMessage, btnSecondary, linkBtn, td, th } from "../components/adminUi";

export default function ActivityClient() {
  return (
    <RequirePermission permission="activity.view" title="Activity">
      <ActivityLog />
    </RequirePermission>
  );
}

/** The learning-activity log (`GET /admin/activity`) and its summary (`GET /admin/activity/summary`). */
function ActivityLog() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = { userId: params.get("userId"), courseId: params.get("courseId"), type: params.get("type"), from: params.get("from"), to: params.get("to"), page: params.get("page") };
  const query = activityQuery(raw);
  const range = { from: query.from, to: query.to };
  const list = useActivity(query);
  const summary = useActivitySummary(range);
  const courses = useCourses();
  const courseName = new Map((courses.data ?? []).map((c) => [c.id, c.title]));
  const [userText, setUserText] = useState(raw.userId ?? "");
  const userInvalid = userText.trim() !== "" && !isUuid(userText.trim());

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const s = summary.data;
  const total = s ? Object.values(s.byType).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const filtered = !!(query.userId || query.courseId || query.type || query.from || query.to);

  return (
    <AdminPage title="Activity" description="What learners do on the platform: sign-ins, course and resource views, submissions and discussion posts.">
      {/* Summary */}
      <section aria-labelledby="activity-summary" className="mb-6">
        <h2 id="activity-summary" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          {s ? `${formatDate(s.from)} – ${formatDate(s.to)}` : "Summary"}
          {!query.from && !query.to && <span className="normal-case font-medium text-gray-400"> (last 30 days)</span>}
        </h2>
        {summary.isError ? (
          <ErrorState error={summary.error} title="Couldn't load the summary" onRetry={() => summary.refetch()} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="activity-summary">
            <MetricCard label="Active users" value={s ? formatNumber(s.activeUsers) : "…"} />
            <MetricCard label="Activities" value={s ? formatNumber(total) : "…"} />
            {ACTIVITY_TYPES.filter((t) => (s?.byType[t] ?? 0) > 0).map((t) => (
              <MetricCard key={t} label={ACTIVITY_LABEL[t]} value={formatNumber(s?.byType[t] ?? 0)} />
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6" data-testid="activity-filters">
        <SelectFilter label="Type" value={query.type ?? ""} onChange={(v) => setParam("type", v)} options={[{ label: "Any", value: "" }, ...ACTIVITY_TYPES.map((t) => ({ label: ACTIVITY_LABEL[t], value: t }))]} />
        <SelectFilter
          label="Course"
          value={query.courseId ?? ""}
          onChange={(v) => setParam("courseId", v)}
          options={[{ label: "Any", value: "" }, ...(courses.data ?? []).map((c) => ({ label: c.title, value: c.id }))]}
        />
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold">From</span>
          <input type="date" value={raw.from ?? ""} onChange={(e) => setParam("from", e.target.value)} className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs" />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold">To</span>
          <input type="date" value={raw.to ?? ""} onChange={(e) => setParam("to", e.target.value)} className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs" />
        </label>
        <form
          className="flex items-center gap-2 text-xs text-gray-500"
          onSubmit={(e) => {
            e.preventDefault();
            if (!userInvalid) setParam("userId", userText.trim());
          }}
        >
          <label htmlFor="activity-user" className="font-semibold">
            User ID
          </label>
          <input
            id="activity-user"
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            placeholder="Paste a user ID"
            aria-invalid={userInvalid || undefined}
            className={`bg-white border rounded-full px-3 py-1.5 text-xs w-72 ${userInvalid ? "border-red-400" : "border-gray-200"}`}
          />
          <button type="submit" className={btnSecondary} disabled={userInvalid}>
            Apply
          </button>
        </form>
        {filtered && (
          <button
            type="button"
            className={linkBtn}
            onClick={() => {
              setUserText("");
              router.replace(pathname, { scroll: false });
            }}
          >
            Clear filters
          </button>
        )}
      </div>
      {userInvalid && <p className="-mt-4 mb-4 text-xs text-red-600">A user ID looks like 3f2b…-…; pick a user from the list to filter by them.</p>}

      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the activity log" onRetry={() => list.refetch()} />
      ) : (
        <TableCard
          footer={
            list.data && (
              <div className="px-4 pb-4">
                <Pagination page={query.page ?? 1} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={(p) => setParam("page", String(p))} disabled={list.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>When</th>
              <th className={th}>User</th>
              <th className={th}>Role</th>
              <th className={th}>Activity</th>
              <th className={th}>Course</th>
              <th className={th}>Record</th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${list.isFetching && list.data ? "opacity-60" : ""}`} data-testid="activity-rows">
            {list.isPending ? (
              <TableMessage colSpan={6}>Loading activity…</TableMessage>
            ) : list.data.data.length === 0 ? (
              <TableMessage colSpan={6}>No activity matches these filters.</TableMessage>
            ) : (
              list.data.data.map((a) => (
                <tr key={a.id} className="text-xs" data-testid="activity-row" data-type={a.type}>
                  <td className={`${td} text-gray-400 whitespace-nowrap`}>{formatDateTime(a.createdAt)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {a.user ? (
                      <button
                        type="button"
                        className="font-semibold text-gray-800 hover:text-indigo-700"
                        title="Show only this user's activity"
                        onClick={() => {
                          setUserText(a.userId);
                          setParam("userId", a.userId);
                        }}
                      >
                        {a.user.firstName} {a.user.lastName} <span className="font-normal text-gray-400">@{a.user.username}</span>
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${td} text-gray-500`}>{a.user ? roleLabel(a.user.role) : "—"}</td>
                  <td className={td}>
                    <Badge className="bg-indigo-50 text-indigo-700">{ACTIVITY_LABEL[a.type as ActivityType] ?? a.type}</Badge>
                  </td>
                  <td className={`${td} text-gray-600`}>{a.courseId ? (courseName.get(a.courseId) ?? a.courseId.slice(0, 8)) : "—"}</td>
                  <td className={`${td} text-gray-500`}>{a.entityType ? `${a.entityType}${a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
