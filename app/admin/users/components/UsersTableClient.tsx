"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MailPlus, Upload, UserPlus } from "lucide-react";
import type { CreateUserInput, InviteUserInput, UserFilters } from "@/lib/api/admin";
import type { Role } from "@/lib/api/types";
import { useAdminDivisions, useAdminUsers, useCreateUser } from "@/lib/queries/admin";
import { formatDate } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, Modal, Notice, SearchInput, SelectFilter, TableCard, TableMessage, btnPrimary, btnSecondary, linkBtn, td, th } from "../../components/adminUi";
import { AccountStatusBadge, UserForm } from "./userUi";
import ImportUsersDialog from "./ImportUsersDialog";

const ROLE_TABS: { label: string; value: "" | Role }[] = [
  { label: "All", value: "" },
  { label: "Students", value: "STUDENT" },
  { label: "Coaches", value: "MENTOR" },
  { label: "Admins", value: "ADMIN" },
];

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
  const role = (params.get("role") ?? "") as "" | Role;
  const status = STATUS_FILTERS[params.get("status") ?? ""] ? (params.get("status") ?? "") : "";
  const divisionId = params.get("divisionId") ?? "";
  const search = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [dialog, setDialog] = useState<"create" | "invite" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filters: UserFilters = {
    role: role || undefined,
    divisionId: divisionId || undefined,
    search: search || undefined,
    ...STATUS_FILTERS[status].flags,
    page,
    limit: PAGE_SIZE,
  };
  const users = useAdminUsers(filters);
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
          <p className="text-sm text-gray-500 mt-1 font-medium">Every account on the platform — students, coaches and administrators.</p>
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
        <FilterPills label="Role" options={ROLE_TABS} value={role} onChange={(v) => setParam("role", v)} />
        <SelectFilter label="Status" value={status} onChange={(v) => setParam("status", v)} options={Object.entries(STATUS_FILTERS).map(([value, s]) => ({ value, label: s.label }))} />
        <SelectFilter
          label="Division"
          value={divisionId}
          onChange={(v) => setParam("divisionId", v)}
          options={[{ label: "All", value: "" }, ...(divisions.data ?? []).map((d) => ({ label: d.name, value: d.id }))]}
        />
      </div>

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
              <TableMessage colSpan={7}>Loading users…</TableMessage>
            ) : users.data.data.length === 0 ? (
              <TableMessage colSpan={7}>No users found matching your criteria.</TableMessage>
            ) : (
              users.data.data.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/60 transition-colors text-xs">
                  <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>
                    {u.firstName} {u.lastName}
                    <span className="block text-[11px] font-normal text-gray-400">@{u.username}</span>
                  </td>
                  <td className={`${td} text-gray-500 font-medium`}>{u.email}</td>
                  <td className={`${td} text-gray-600 font-medium`}>{u.role === "ADMIN" ? "Admin" : u.role === "MENTOR" ? "Coach" : "Student"}</td>
                  <td className={`${td} text-gray-600 font-medium whitespace-nowrap`}>
                    {u.division ? `${u.division.name}${u.gradeLevel ? ` · ${u.gradeLevel}` : ""}` : "—"}
                  </td>
                  <td className={td}>
                    <AccountStatusBadge user={u} />
                  </td>
                  <td className={`${td} text-gray-500 whitespace-nowrap`}>{u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never"}</td>
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
          <p className="text-xs text-gray-500 mb-4">
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

      {dialog === "import" && <ImportUsersDialog onClose={() => setDialog(null)} onImported={(n) => setNotice(`${n} account${n === 1 ? "" : "s"} invited from the CSV file.`)} />}
    </>
  );
}
