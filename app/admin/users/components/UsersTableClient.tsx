"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layers, MailPlus, Upload, UserPlus } from "lucide-react";
import type { CreateUserInput, InviteUserInput, UserFilters } from "@/lib/api/admin";
import type { Permission, Role } from "@/lib/api/types";
import { hasFeature } from "@/lib/api/capabilities";
import { bulkUsersApi, type BulkSelection } from "@/lib/api/bulk-users";
import { saveFile } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { useSession } from "@/lib/auth/session";
import { assignableRoles } from "@/lib/auth/role-rules";
import { MAX_SELECTED, bulkAvailable, bulkRoleOptions, buildSelection, exportAvailable, toggleId, togglePage, type SelectionChoice } from "@/lib/admin/bulk-users";
import { roleLabel } from "@/lib/auth/roles";
import CoachSubjectsNote from "./CoachSubjectsNote";
import TeacherRoleBadge from "@/app/components/teachers/TeacherRoleBadge";
import { roleFilterTabs } from "@/lib/auth/role-rules";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { useAdminDivisions, useAdminUsers, useCreateUser } from "@/lib/queries/admin";
import { formatDate } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, Modal, Notice, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";
import { AccountStatusBadge, UserForm } from "./userUi";
import ImportUsersDialog from "./ImportUsersDialog";
import BulkActionDialog from "./BulkActionDialog";

/** URL value → backend flags. */
const STATUS_FILTERS: Record<string, { label: string; flags: Partial<UserFilters> }> = {
  "": { label: "Any status", flags: {} },
  active: { label: "Active", flags: { isActive: true, isActivated: true, isApproved: true } },
  suspended: { label: "Suspended", flags: { isActive: false } },
  "awaiting-setup": { label: "Awaiting setup", flags: { isActive: true, isActivated: false } },
  "awaiting-approval": { label: "Awaiting approval", flags: { isActive: true, isApproved: false } },
};

const PAGE_SIZE = 20;

export default function UsersTableClient() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Role tabs follow the backend: the newer roles only on a backend that lists them
  // (GET /api/v1 capabilities). A role in the URL that is not offered is ignored, so a
  // production backend never receives a filter value it would reject.
  const { detection } = useBackendCapabilities();
  const roleTabs = roleFilterTabs(detection?.state === "NEW" ? detection.roles : null);
  const requestedRole = (params.get("role") ?? "") as "" | Role;
  const role = roleTabs.some((t) => t.value === requestedRole) ? requestedRole : "";
  const status = STATUS_FILTERS[params.get("status") ?? ""] ? (params.get("status") ?? "") : "";
  const divisionId = params.get("divisionId") ?? "";
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [dialog, setDialog] = useState<"create" | "invite" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Bulk operations (capability bulkUserOperations + users.bulkManage / users.export). The selection is either the
  // accounts ticked here (kept across pages, at most MAX_SELECTED) or every account matching the filters.
  const session = useSession();
  const can = (p: Permission) => session.can(p);
  const bulkOn = bulkAvailable(detection, can);
  const exportOn = exportAvailable(detection, can);
  const selectable = bulkOn || exportOn;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkSelection, setBulkSelection] = useState<BulkSelection | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkRoles = bulkRoleOptions(
    assignableRoles({ teacherAccounts: hasFeature(detection, "teacherAccounts"), headCoachAccounts: hasFeature(detection, "headCoachAccounts"), can: (p) => can(p as Permission) }),
  );

  const filters: UserFilters = {
    role: role || undefined,
    divisionId: divisionId || undefined,
    search: search || undefined,
    ...STATUS_FILTERS[status].flags,
    page,
    limit: PAGE_SIZE,
  };
  const users = useAdminUsers(filters);
  const pageIds = users.data?.data.map((u) => u.id) ?? [];
  const pageAllOn = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const total = users.data?.meta.total ?? 0;

  function selectionFor(choice: SelectionChoice): BulkSelection | null {
    return buildSelection(choice, selected, filters);
  }
  async function exportCsv(choice: SelectionChoice) {
    const sel = selectionFor(choice);
    if (!sel) return;
    setExporting(true);
    setBulkError(null);
    try {
      saveFile(await bulkUsersApi.export(sel));
    } catch (e) {
      setBulkError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  const divisions = useAdminDivisions();
  const createUser = useCreateUser();

  /** Update one URL filter; any filter change returns to page 1. */
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Users</h1>
          <p className="text-sm text-gray-600 mt-1 font-medium">Every account on the platform — students, coaches and administrators.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDialog("create")} className={btnPrimary}>
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add user
          </button>
          <button type="button" onClick={() => setDialog("invite")} className={btnSecondary}>
            <MailPlus className="h-3.5 w-3.5" aria-hidden="true" /> Invite
          </button>
          <button type="button" onClick={() => setDialog("import")} className={btnSecondary}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import CSV
          </button>
          {bulkOn && (
            <Link href="/admin/users/bulk" className={btnSecondary}>
              <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Bulk operations
            </Link>
          )}
        </div>
      </div>

      {notice && (
        <Notice onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      {/* Controls Bar: Search & Pill Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SearchInput value={search} onChange={(v) => setParam("q", v)} placeholder="Search name, username or e-mail…" label="Search users" />
        <FilterPills label="Role" options={roleTabs} value={role} onChange={(v) => setParam("role", v)} />
        <SelectFilter label="Status" value={status} onChange={(v) => setParam("status", v)} options={Object.entries(STATUS_FILTERS).map(([value, s]) => ({ value, label: s.label }))} />
        <SelectFilter
          label="Division"
          value={divisionId}
          onChange={(v) => setParam("divisionId", v)}
          options={[{ label: "All", value: "" }, ...(divisions.data ?? []).map((d) => ({ label: d.name, value: d.id }))]}
        />
      </div>

      {selectable && users.data && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white border border-gray-100 px-4 py-3 text-xs text-gray-600" data-testid="bulk-toolbar">
          <span>
            {selected.size > 0
              ? `${selected.size} selected${selected.size >= MAX_SELECTED ? ` (the maximum, ${MAX_SELECTED})` : ""}`
              : "Tick accounts to act on them, or act on every match."}
          </span>
          {selected.size > 0 && (
            <button type="button" className={linkBtn} onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          )}
          <span className="flex-1" />
          {bulkOn && selected.size > 0 && (
            <button type="button" className={btnSecondary} onClick={() => setBulkSelection(selectionFor("selected"))}>
              Act on {selected.size} selected
            </button>
          )}
          {bulkOn && total > 0 && (
            <button type="button" className={btnSecondary} onClick={() => setBulkSelection(selectionFor("filter"))}>
              Act on all {total} matching
            </button>
          )}
          {exportOn && (
            <button
              type="button"
              className={btnSecondary}
              disabled={exporting || total === 0}
              onClick={() => void exportCsv(selected.size > 0 ? "selected" : "filter")}
              title="Name, username, e-mail, role, state, school, grade, created. Never dates of birth or phone numbers."
            >
              {exporting ? "Exporting…" : selected.size > 0 ? `Export ${selected.size} selected (CSV)` : `Export all ${total} matching (CSV)`}
            </button>
          )}
        </div>
      )}
      {bulkError && (
        <Notice tone="error" onClose={() => setBulkError(null)}>
          {bulkError}
        </Notice>
      )}

      {users.isError ? (
        <ErrorState error={users.error} title="Couldn't load users" onRetry={() => users.refetch()} />
      ) : (
        <TableCard
          footer={
            users.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={users.data.meta.totalPages} total={users.data.meta.total} onPage={(p) => setParam("page", String(p))} disabled={users.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              {selectable && (
                <th className={`${th} w-8`}>
                  <input
                    type="checkbox"
                    aria-label="Select every account on this page"
                    checked={pageAllOn}
                    disabled={pageIds.length === 0}
                    onChange={() => setSelected((cur) => togglePage(cur, pageIds))}
                  />
                </th>
              )}
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Role</th>
              <th className={th}>Division</th>
              <th className={th}>Status</th>
              <th className={th}>Last sign-in</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/70 ${users.isFetching && users.data ? "opacity-60" : ""}`}>
            {users.isPending ? (
              <TableMessage colSpan={selectable ? 8 : 7}>Loading users…</TableMessage>
            ) : users.data.data.length === 0 ? (
              <TableMessage colSpan={selectable ? 8 : 7}>No users found matching your criteria.</TableMessage>
            ) : (
              users.data.data.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                  {selectable && (
                    <td className={td}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${u.firstName} ${u.lastName}`}
                        checked={selected.has(u.id)}
                        onChange={() => setSelected((cur) => toggleId(cur, u.id))}
                      />
                    </td>
                  )}
                  <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>
                    {u.firstName} {u.lastName}
                    <span className="block text-[11px] font-normal text-gray-500">@{u.username}</span>
                  </td>
                  <td className={`${td} text-gray-600 font-medium`}>{u.email}</td>
                  <td className={`${td} text-gray-600 font-medium`}>
                    {roleLabel(u.role)}
                    {u.teacherSchoolRole && <TeacherRoleBadge role={u.teacherSchoolRole} className="ml-2" />}
                    {u.role === "TEACHER" && u.testSubmissionAllowed === false && (
                      <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-900" title="An administrator turned off this teacher's test submission for students" data-testid="test-submission-off">Test submission off</span>
                    )}
                    <CoachSubjectsNote role={u.role} subjects={u.olympiadInterests} other={u.olympiadInterestOther} />
                  </td>
                  <td className={`${td} text-gray-600 font-medium whitespace-nowrap`}>
                    {u.division ? `${u.division.name}${u.gradeLevel ? ` · ${u.gradeLevel}` : ""}` : "—"}
                  </td>
                  <td className={td}>
                    <AccountStatusBadge user={u} />
                  </td>
                  <td className={`${td} text-gray-600 whitespace-nowrap`}>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
                  <td className={td}>
                    <Link href={`/admin/users/${u.id}`} className={linkBtn} aria-label={`View ${u.firstName} ${u.lastName}`}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {(dialog === "create" || dialog === "invite") && (
        <Modal wide title={dialog === "create" ? "Add a user" : "Invite a user"} onClose={() => setDialog(null)}>
          <p className="text-xs text-gray-600 mb-4">
            {dialog === "create"
              ? "The account is active immediately with the password you set. Share it securely; the user can change it later."
              : "The account is created without a password and an activation link (valid 7 days) is e-mailed to the person."}
          </p>
          <UserForm
            mode={dialog}
            submitLabel={dialog === "create" ? "Create account" : "Send invitation"}
            onCancel={() => setDialog(null)}
            onSubmit={async (input) => {
              const mode = dialog;
              const user = await createUser.mutateAsync(
                mode === "create" ? { mode, input: input as CreateUserInput } : { mode, input: input as InviteUserInput },
              );
              setDialog(null);
              setNotice(mode === "create" ? `Account @${user.username} created.` : `Invitation sent to ${user.email}.`);
            }}
          />
        </Modal>
      )}

      {bulkSelection && (
        <BulkActionDialog
          selection={bulkSelection}
          can={can}
          roleOptions={bulkRoles}
          onClose={() => setBulkSelection(null)}
          onStarted={(id, n) => {
            setBulkSelection(null);
            setSelected(new Set());
            setNotice(`Bulk operation started on ${n} account${n === 1 ? "" : "s"}.`);
            router.push(`/admin/users/bulk?operation=${encodeURIComponent(id)}`);
          }}
        />
      )}

      {dialog === "import" && <ImportUsersDialog onClose={() => setDialog(null)} onImported={(n) => setNotice(`${n} account${n === 1 ? "" : "s"} invited from the CSV file.`)} />}
    </>
  );
}
