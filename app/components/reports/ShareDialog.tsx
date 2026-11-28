"use client";

/**
 * Who may use a report: users and roles with View, Download and Edit (independent; "All" = the three), added, changed
 * or removed and saved together. Never students. The backend records every change in the audit log.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { usersApi } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/errors";
import type { Role } from "@/lib/api/types";
import { roleLabel } from "@/lib/auth/roles";
import { SHAREABLE_ROLES, grantInputs, levelsText, normaliseLevels, shareableRolesFor, type ReportGrant } from "@/lib/reports/custom-reports";
import { useSession } from "@/lib/auth/session";
import { useReportGrants, useSetGrants } from "@/lib/queries/custom-reports";
import { Alert, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { Modal, btnPrimary, btnSecondary } from "@/app/admin/components/adminUi";

type Level = "canView" | "canDownload" | "canEdit";
const LEVELS: Array<{ key: Level; label: string }> = [{ key: "canView", label: "View" }, { key: "canDownload", label: "Download" }, { key: "canEdit", label: "Edit" }];
const keyOf = (g: ReportGrant) => (g.user ? `user:${g.user.id}` : `role:${g.role}`);

function Editor({ reportId, initial, onClose }: { reportId: string; initial: ReportGrant[]; onClose: () => void }) {
  const viewerRole = useSession().role;
  const save = useSetGrants(reportId);
  const [grants, setGrants] = useState<ReportGrant[]>(initial);
  const [search, setSearch] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const found = useQuery({
    queryKey: ["report-share-users", search],
    queryFn: () => usersApi.list({ search, limit: 8 }),
    enabled: search.trim().length >= 2,
  });
  const add = (g: ReportGrant) => { if (!grants.some((x) => keyOf(x) === keyOf(g))) setGrants([...grants, g]); };
  const setLevel = (k: string, level: Level | "all", on: boolean) =>
    setGrants(grants.map((g) => {
      if (keyOf(g) !== k) return g;
      if (level === "all") return { ...g, canView: on, canDownload: on, canEdit: on };
      const next = { ...g, [level]: on };
      // Taking View away takes everything away (Download and Edit include View).
      return level === "canView" && !on ? { ...next, canDownload: false, canEdit: false } : normaliseLevels(next) as ReportGrant & typeof next;
    }));

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="share-user" className="mb-1 block text-xs font-semibold text-gray-700">Add a person</label>
          <input id="share-user" className="w-full rounded-xl border border-gray-300 p-2.5 text-sm" placeholder="Name, username or e-mail" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="share-search" />
          {found.data && search.trim().length >= 2 && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-200 text-sm">
              {found.data.data.filter((u) => u.role !== "STUDENT").map((u) => (
                <li key={u.id}>
                  <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-gray-50" onClick={() => { add({ user: { id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username, role: u.role }, role: null, canView: true, canDownload: false, canEdit: false }); setSearch(""); }}>
                    {u.firstName} {u.lastName} <span className="text-xs text-gray-500">@{u.username} · {roleLabel(u.role)}</span>
                  </button>
                </li>
              ))}
              {found.data.data.every((u) => u.role === "STUDENT") && <li className="px-3 py-1.5 text-xs text-gray-600">No staff account matches. Reports are never shared with students.</li>}
            </ul>
          )}
        </div>
        <div>
          <label htmlFor="share-role" className="mb-1 block text-xs font-semibold text-gray-700">Add a role</label>
          <select id="share-role" className="w-full rounded-xl border border-gray-300 p-2.5 text-sm" value="" onChange={(e) => e.target.value && add({ role: e.target.value as Role, user: null, canView: true, canDownload: false, canEdit: false })} data-testid="share-role">
            <option value="">Choose a role…</option>
            {shareableRolesFor(viewerRole).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {grants.length === 0 ? (
        <p className="text-sm text-gray-600">Only you and the report builders can use this report.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm" data-testid="share-grants">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-gray-500"><th className="py-1 pr-3">Who</th>{LEVELS.map((l) => <th key={l.key} className="px-2 py-1">{l.label}</th>)}<th className="px-2 py-1">All</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {grants.map((g) => {
                const k = keyOf(g);
                const all = g.canView && g.canDownload && g.canEdit;
                return (
                  <tr key={k}>
                    <td className="py-1.5 pr-3">{g.user ? <>{g.user.firstName} {g.user.lastName} <span className="text-xs text-gray-500">@{g.user.username}</span></> : <>Every {SHAREABLE_ROLES.find((r) => r.value === g.role)?.label ?? g.role}</>}<span className="block text-[11px] text-gray-500">{levelsText(g)}</span></td>
                    {LEVELS.map((l) => <td key={l.key} className="px-2"><input type="checkbox" aria-label={`${l.label} for ${k}`} checked={g[l.key]} onChange={(e) => setLevel(k, l.key, e.target.checked)} /></td>)}
                    <td className="px-2"><input type="checkbox" aria-label={`All for ${k}`} checked={all} onChange={(e) => setLevel(k, "all", e.target.checked)} /></td>
                    <td className="px-2"><button type="button" aria-label={`Revoke ${k}`} className="rounded p-1 text-red-700 hover:bg-red-50" onClick={() => setGrants(grants.filter((x) => keyOf(x) !== k))}><X className="h-4 w-4" aria-hidden="true" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {problem && <div className="mt-3"><Alert tone="error">{problem}</Alert></div>}
      <div className="mt-4 flex gap-2">
        <button type="button" className={btnPrimary} disabled={save.isPending} data-testid="share-save"
          onClick={async () => { try { await save.mutateAsync(grantInputs(grants)); onClose(); } catch (err) { setProblem(errorMessage(err)); } }}>
          {save.isPending ? "Saving…" : "Save access"}
        </button>
        <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
      </div>
    </>
  );
}

export default function ShareDialog({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const grants = useReportGrants(reportId);
  return (
    <Modal wide title="Who can use this report" onClose={onClose}>
      <p className="mb-4 text-xs text-gray-600">View: open the report. Download: export it to CSV or Excel. Edit: change it. Each person still sees only the rows they are allowed to see.</p>
      {grants.isPending ? <LoadingBlock /> : grants.isError ? <ErrorState error={grants.error} onRetry={() => grants.refetch()} /> : <Editor reportId={reportId} initial={grants.data.grants} onClose={onClose} />}
    </Modal>
  );
}
