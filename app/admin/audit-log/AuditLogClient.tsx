"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { auditApi, type AuditFilters } from "@/lib/api/admin";
import type { AuditCategory, AuditLogEntry, Role } from "@/lib/api/types";
import { useAuditEntry, useAuditLog } from "@/lib/queries/admin";
import { formatDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, CsvButton, FilterPills, Modal, SearchInput, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "../components/adminUi";
import { AUDIT_CATEGORY_LABEL, auditActor, humanizeAction } from "../components/auditText";

const MAIN_TABS: { label: string; value: "" | AuditCategory }[] = [
  { label: "All", value: "" },
  { label: "Results", value: "RESULTS" },
  { label: "Assignments", value: "ASSIGNMENTS" },
  { label: "Reviews", value: "REVIEWS" },
  { label: "Users", value: "USERS" },
  { label: "Courses", value: "COURSES" },
  { label: "Security", value: "SECURITY" },
];

const CATEGORY_BADGE: Partial<Record<AuditCategory, string>> = {
  RESULTS: "bg-emerald-50 text-emerald-700",
  ASSIGNMENTS: "bg-indigo-50 text-indigo-700",
  REVIEWS: "bg-blue-50 text-blue-700",
  USERS: "bg-purple-50 text-purple-700",
  SECURITY: "bg-red-50 text-red-600",
  SETTINGS: "bg-amber-50 text-amber-700",
};

function target(e: AuditLogEntry): string {
  const m = e.metadata ?? {};
  const name = typeof m.title === "string" ? m.title : typeof m.username === "string" ? `@${m.username}` : typeof m.report === "string" ? m.report : null;
  return [e.entity, name ?? (e.entityId ? e.entityId.slice(0, 8) : null)].filter(Boolean).join(" · ");
}

function EntryDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const entry = useAuditEntry(id);
  return (
    <Modal wide title="Audit entry" onClose={onClose}>
      {entry.isPending ? (
        <LoadingBlock />
      ) : entry.isError ? (
        <ErrorState error={entry.error} onRetry={() => entry.refetch()} />
      ) : (
        <dl className="space-y-3 text-sm">
          {[
            ["When", formatDateTime(entry.data.createdAt)],
            ["Actor", `${auditActor(entry.data)}${entry.data.actorRole ? ` (${ROLE_LABEL[entry.data.actorRole as Role] ?? entry.data.actorRole})` : ""}`],
            ["Action", `${humanizeAction(entry.data.action)} (${entry.data.action})`],
            ["Category", AUDIT_CATEGORY_LABEL[entry.data.category] ?? entry.data.category],
            ["Record", `${entry.data.entity}${entry.data.entityId ? ` · ${entry.data.entityId}` : ""}`],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col sm:flex-row gap-0.5 sm:gap-4">
              <dt className="sm:w-28 shrink-0 text-[11px] font-bold uppercase tracking-wider text-gray-400 pt-0.5">{k}</dt>
              <dd className="text-gray-800 break-all">{v}</dd>
            </div>
          ))}
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Details</dt>
            <dd>
              <pre className="text-[11px] bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(entry.data.metadata ?? {}, null, 2)}</pre>
            </dd>
          </div>
        </dl>
      )}
    </Modal>
  );
}

/** The append-only audit trail (`GET /admin/audit-logs`), newest first. */
export default function AuditLogClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const category = (params.get("category") ?? "") as "" | AuditCategory;
  const actorRole = (params.get("actorRole") ?? "") as "" | Role;
  const action = params.get("action") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [open, setOpen] = useState<string | null>(null);

  const filters: AuditFilters = { category: category || undefined, actorRole: actorRole || undefined, action: action || undefined, from: from || undefined, to: to || undefined, page, limit: 25 };
  const logs = useAuditLog(filters);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  const otherCategories = (Object.keys(AUDIT_CATEGORY_LABEL) as AuditCategory[]).filter((c) => !MAIN_TABS.some((t) => t.value === c));

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-1 font-medium">A chronological record of key administrative actions across the platform.</p>
        </div>
        <CsvButton onDownload={() => auditApi.exportCsv(filters)} />
      </div>

      {/* Controls Bar: Search & Pill Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput value={action} onChange={(v) => setParam("action", v)} placeholder="Search actions (e.g. publish)…" label="Search actions" />
        <SelectFilter label="Role" value={actorRole} onChange={(v) => setParam("actorRole", v)} options={[{ label: "Any", value: "" }, { label: "Administrator", value: "ADMIN" }, { label: "Coach", value: "MENTOR" }, { label: "Student", value: "STUDENT" }]} />
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold">From</span>
          <input type="date" value={from} onChange={(e) => setParam("from", e.target.value)} className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs" />
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold">To</span>
          <input type="date" value={to} onChange={(e) => setParam("to", e.target.value)} className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-xs" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FilterPills label="Category" options={MAIN_TABS} value={category} onChange={(v) => setParam("category", v)} />
        <SelectFilter
          label="More"
          value={otherCategories.includes(category as AuditCategory) ? category : ""}
          onChange={(v) => setParam("category", v)}
          options={[{ label: "Other categories…", value: "" }, ...otherCategories.map((c) => ({ label: AUDIT_CATEGORY_LABEL[c], value: c }))]}
        />
      </div>

      {logs.isError ? (
        <ErrorState error={logs.error} title="Couldn't load the audit log" onRetry={() => logs.refetch()} />
      ) : (
        <TableCard
          footer={
            logs.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={logs.data.meta.totalPages} total={logs.data.meta.total} onPage={(p) => setParam("page", String(p))} disabled={logs.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>When</th>
              <th className={th}>Actor</th>
              <th className={th}>Role</th>
              <th className={th}>Action</th>
              <th className={th}>Target</th>
              <th className={th}>Category</th>
              <th className={th}>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${logs.isFetching && logs.data ? "opacity-60" : ""}`}>
            {logs.isPending ? (
              <TableMessage colSpan={7}>Loading the audit log…</TableMessage>
            ) : logs.data.data.length === 0 ? (
              <TableMessage colSpan={7}>No entries match these filters.</TableMessage>
            ) : (
              logs.data.data.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                  <td className={`${td} text-gray-400 font-medium whitespace-nowrap`}>{formatDateTime(e.createdAt)}</td>
                  <td className={`${td} font-bold text-gray-800 whitespace-nowrap`}>{auditActor(e)}</td>
                  <td className={`${td} text-gray-500 font-medium`}>{e.actorRole ? (ROLE_LABEL[e.actorRole as Role] ?? e.actorRole) : "—"}</td>
                  <td className={`${td} text-gray-700 font-medium`}>{humanizeAction(e.action)}</td>
                  <td className={`${td} text-gray-600 font-medium break-words max-w-[240px]`}>{target(e)}</td>
                  <td className={td}>
                    <Badge className={CATEGORY_BADGE[e.category] ?? "bg-gray-100 text-gray-600"}>{AUDIT_CATEGORY_LABEL[e.category] ?? e.category}</Badge>
                  </td>
                  <td className={td}>
                    <button type="button" onClick={() => setOpen(e.id)} className={linkBtn} aria-label={`Details of ${humanizeAction(e.action)} at ${formatDateTime(e.createdAt)}`}>
                      Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
      {open && <EntryDialog id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
