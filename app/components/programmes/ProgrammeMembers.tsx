"use client";

/**
 * Members of one programme (GET /admin/programmes/:id/members — no contact
 * details, grades or feedback), with the membership changes the caller may make:
 *
 * - end a membership (DELETE …/members/:userId) and add it back right away;
 * - add someone found with a people search (POST …/members { userId }) — only
 *   for callers who may search accounts (GET /admin/users, users.manage).
 *
 * Which roles the caller may change comes from lib/programmes/programme-rules.ts
 * (administrators: students and coaches; a Head Coach: students only). The
 * backend checks every change again.
 */
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { ProgrammeMember } from "@/lib/api/programmes";
import { formatDate, personName } from "@/lib/format";
import { membershipError, type MemberRole } from "@/lib/programmes/programme-rules";
import { useMembershipAction, usePeopleSearch, useProgrammeMembers } from "@/lib/queries/programmes";
import { Alert, ErrorState, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { ConfirmDialog, Notice, SearchInput, TableCard, TableMessage, btnSecondary, linkBtn, td, th } from "@/app/admin/components/adminUi";

const PAGE_SIZE = 20;

function changeError(e: unknown) {
  return (isApiError(e) && membershipError(e.code, e.status)) || errorMessage(e);
}

export default function ProgrammeMembers({
  programmeId,
  role,
  managed,
  canSearch,
  former = false,
}: {
  programmeId: string;
  role: MemberRole;
  /** Roles whose membership the caller may add or end. */
  managed: readonly MemberRole[];
  /** Whether the caller may search accounts to add (users.manage). */
  canSearch: boolean;
  /** Show former members (administrators only). */
  former?: boolean;
}) {
  const [page, setPage] = useState(1);
  const members = useProgrammeMembers(programmeId, { role, page, limit: PAGE_SIZE, ...(former && { isActive: false }) });
  const action = useMembershipAction(programmeId);
  const [ending, setEnding] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string; undo?: { id: string; name: string } } | null>(null);
  const [adding, setAdding] = useState(false);

  const mayChange = managed.includes(role);
  const student = role === "STUDENT";
  const noun = student ? "student" : "coach";
  const cols = (student ? 5 : 2) + (mayChange ? 1 : 0);

  async function add(id: string, name: string) {
    try {
      await action.mutateAsync({ type: "add", userId: id });
      setNotice({ tone: "success", text: `${name} is now a member of this programme.` });
    } catch (e) {
      setNotice({ tone: "error", text: changeError(e) });
    }
  }

  if (members.isError) return <ErrorState error={members.error} title="Couldn't load the members" onRetry={() => members.refetch()} />;
  const rows = members.data?.data ?? [];

  return (
    <>
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
          {notice.undo && (
            <button
              type="button"
              className={`${linkBtn} ml-2 underline`}
              disabled={action.isPending}
              onClick={() => {
                const u = notice.undo!;
                void add(u.id, u.name);
              }}
            >
              Add {notice.undo.name} back
            </button>
          )}
        </Notice>
      )}

      {mayChange && !former && (
        <div className="mb-4" data-testid={`add-${noun}`}>
          {canSearch ? (
            adding ? (
              <AddPanel role={role} onAdd={add} busy={action.isPending} onClose={() => setAdding(false)} />
            ) : (
              <button type="button" className={btnSecondary} onClick={() => setAdding(true)}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Add a {noun}
              </button>
            )
          ) : (
            <p className="text-xs text-gray-500" data-testid="add-member-note">
              You can end a {noun}&apos;s membership here and add them back. To add a {noun} who is not in the programme yet, ask an administrator — there is no {noun} search for your role.
            </p>
          )}
        </div>
      )}

      <TableCard footer={members.data && <Pagination page={page} totalPages={members.data.meta.totalPages} total={members.data.meta.total} onPage={setPage} disabled={members.isFetching} />}>
        <thead className="bg-gray-50/60 border-b border-gray-100">
          <tr>
            <th className={th}>{student ? "Student" : "Coach"}</th>
            {student && <th className={th}>Grade</th>}
            {student && <th className={th}>Division</th>}
            {student && <th className={th}>School</th>}
            <th className={th}>{former ? "Membership ended" : "Member since"}</th>
            {mayChange && <th className={`${th} text-right`}>Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50" data-testid={`members-${role}`}>
          {members.isPending ? (
            <TableMessage colSpan={cols}>Loading…</TableMessage>
          ) : rows.length === 0 ? (
            <TableMessage colSpan={cols}>{former ? `No former ${noun}s.` : `No ${noun}s in this programme yet.`}</TableMessage>
          ) : (
            rows.map((m) => <MemberRow key={m.id} m={m} student={student} former={former} mayChange={mayChange} busy={action.isPending} onEnd={setEnding} onAdd={add} />)
          )}
        </tbody>
      </TableCard>

      {ending && (
        <ConfirmDialog
          title="End this membership?"
          body={`${ending.name} leaves this programme. Their account, work and results are kept, and they can be added back.`}
          confirmLabel="End membership"
          tone="danger"
          onClose={() => setEnding(null)}
          onConfirm={async () => {
            const who = ending;
            try {
              await action.mutateAsync({ type: "end", userId: who.id });
              setNotice({ tone: "success", text: `${who.name} is no longer a member of this programme.`, undo: who });
            } catch (e) {
              setNotice({ tone: "error", text: changeError(e) });
            }
          }}
        />
      )}
    </>
  );
}

function MemberRow({
  m,
  student,
  former,
  mayChange,
  busy,
  onEnd,
  onAdd,
}: {
  m: ProgrammeMember;
  student: boolean;
  former: boolean;
  mayChange: boolean;
  busy: boolean;
  onEnd: (v: { id: string; name: string }) => void;
  onAdd: (id: string, name: string) => void;
}) {
  const name = personName(m);
  return (
    <tr>
      <td className={td}>
        <p className="font-semibold text-gray-800">{name}</p>
        <p className="text-xs text-gray-400">@{m.username}{!m.isActive && " · suspended"}</p>
      </td>
      {student && <td className={`${td} text-gray-600`}>{m.gradeLevel ?? "—"}</td>}
      {student && <td className={`${td} text-gray-600`}>{m.division?.name ?? "—"}</td>}
      {student && (
        <td className={`${td} text-gray-600`}>
          {m.school ? (
            <>
              {m.school.name}
              {m.school.verification === "UNVERIFIED" && <span className="ml-1.5 text-[11px] text-amber-700">(not verified)</span>}
            </>
          ) : (
            "—"
          )}
        </td>
      )}
      <td className={`${td} text-gray-600`}>{formatDate(former ? (m.membership.endedAt ?? m.membership.createdAt) : m.membership.createdAt)}</td>
      {mayChange && (
        <td className={`${td} text-right`}>
          {former ? (
            <button type="button" className={linkBtn} disabled={busy} onClick={() => onAdd(m.id, name)} aria-label={`Add ${name} back`}>
              Add back
            </button>
          ) : (
            <button type="button" className={linkBtn} onClick={() => onEnd({ id: m.id, name })} aria-label={`End membership of ${name}`}>
              End membership
            </button>
          )}
        </td>
      )}
    </tr>
  );
}

/** Find an account to add (GET /admin/users?search=&role=). */
function AddPanel({ role, onAdd, busy, onClose }: { role: MemberRole; onAdd: (id: string, name: string) => Promise<void>; busy: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const people = usePeopleSearch(search, role, true);
  const noun = role === "STUDENT" ? "student" : "coach";
  const rows = people.data?.data ?? [];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="member-search">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${noun}s by name or username…`} label={`Search ${noun}s`} />
        <button type="button" className={linkBtn} onClick={onClose}>
          Close
        </button>
      </div>
      {search.trim().length < 2 ? (
        <p className="text-xs text-gray-500">Type at least two letters.</p>
      ) : people.isError ? (
        <Alert tone="error">{errorMessage(people.error)}</Alert>
      ) : people.isPending ? (
        <Spinner className="h-4 w-4" />
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-500">No {noun} matches “{search.trim()}”.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {rows.map((u) => {
            const name = `${u.firstName} ${u.lastName}`;
            return (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-800">{name}</span> <span className="text-xs text-gray-400">@{u.username}</span>
                </span>
                <button type="button" className={linkBtn} disabled={busy} onClick={() => void onAdd(u.id, name)} aria-label={`Add ${name} to the programme`}>
                  Add
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
