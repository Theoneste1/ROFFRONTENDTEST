"use client";

/**
 * Members of one programme (GET /admin/programmes/:id/members — no contact
 * details, grades or feedback), with the membership changes the caller may make:
 *
 * - end a membership (DELETE …/members/:userId) and add it back right away;
 * - add someone found with a people search (POST …/members { userId }):
 *   administrators search accounts (GET /admin/users, users.manage); a Head
 *   Coach searches students who are in no programme yet
 *   (GET /admin/programmes/:id/student-candidates).
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
import { membershipError, type MemberRole, type PeopleSearch } from "@/lib/programmes/programme-rules";
import { useMembershipAction, usePeopleSearch, useProgrammeMembers, useStudentCandidates } from "@/lib/queries/programmes";
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
  search,
  former = false,
}: {
  programmeId: string;
  role: MemberRole;
  /** Roles whose membership the caller may add or end. */
  managed: readonly MemberRole[];
  /** How the caller finds people to add (lib/programmes/programme-rules.ts peopleSearch); null: no search. */
  search: PeopleSearch | null;
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
  // The Head Coach search finds students only.
  const canSearch = search === "users" || (search === "candidates" && role === "STUDENT");
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
              <AddPanel programmeId={programmeId} kind={search === "candidates" ? "candidates" : "users"} role={role} onAdd={add} busy={action.isPending} onClose={() => setAdding(false)} />
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

/**
 * Find an account to add: administrators GET /admin/users?search=&role=; a Head Coach
 * GET /admin/programmes/:id/student-candidates?search= (students in no programme only).
 */
function AddPanel({
  programmeId,
  kind,
  role,
  onAdd,
  busy,
  onClose,
}: {
  programmeId: string;
  kind: PeopleSearch;
  role: MemberRole;
  onAdd: (id: string, name: string) => Promise<void>;
  busy: boolean;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const users = usePeopleSearch(search, role, kind === "users");
  const candidates = useStudentCandidates(programmeId, search, kind === "candidates");
  const people = kind === "candidates" ? candidates : users;
  const noun = role === "STUDENT" ? "student" : "coach";
  const rows: { id: string; firstName: string; lastName: string; username: string; detail?: string }[] =
    kind === "candidates"
      ? (candidates.data?.data ?? []).map((u) => ({
          ...u,
          detail: [u.gradeLevel, u.division?.name, u.school?.name].filter(Boolean).join(" · ") || undefined,
        }))
      : (users.data?.data ?? []);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" data-testid="member-search">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder={`Search ${noun}s by name or username…`} label={`Search ${noun}s`} />
        <button type="button" className={linkBtn} onClick={onClose}>
          Close
        </button>
      </div>
      {kind === "candidates" && (
        <p className="text-xs text-gray-500" data-testid="candidates-note">
          Only students who are not in a programme yet are listed. To move a student from another programme, ask an administrator.
        </p>
      )}
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
                  {u.detail && <span className="block text-xs text-gray-500">{u.detail}</span>}
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
