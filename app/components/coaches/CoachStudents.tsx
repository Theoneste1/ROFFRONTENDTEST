"use client";

/**
 * The coach's Students page (owner 2026-11-23): every student of the coach's programmes, every level — name, level, grade,
 * school and Olympiad subjects; never contact details. Filters: programme, level, search. Open a student for their profile.
 */
import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { coachAccessApi, STUDENTS_VIEW_PROGRAMME } from "@/lib/coaches/coach-access";
import { useDivisions } from "@/lib/queries/divisions";
import { personName } from "@/lib/format";
import { EmptyState, ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import { PageFrame } from "@/app/components/ui/PageFrame";
import Pagination from "@/app/components/ui/Pagination";
import { Notice, SearchInput, SelectFilter, TableCard, TableMessage, td, th } from "@/app/admin/components/adminUi";

const SUBJECT_LABEL: Record<string, string> = { MATHEMATICS: "Mathematics", PHYSICS: "Physics", COMPUTING: "Computing" };

export default function CoachStudents() {
  const { knownPermissions, permissionsStatus } = useSession();
  if (permissionsStatus === "loading") return <PageFrame title="Students"><LoadingBlock /></PageFrame>;
  if (!knownPermissions?.has(STUDENTS_VIEW_PROGRAMME)) {
    return <PageFrame title="Students"><Notice tone="info">This page is for coaches.</Notice></PageFrame>;
  }
  return <StudentsList />;
}

function StudentsList() {
  const [q, setQ] = useState("");
  const [programmeId, setProgrammeId] = useState("");
  const [division, setDivision] = useState("");
  const [page, setPage] = useState(1);
  const divisions = useDivisions();
  const f = { ...(q && { q }), ...(programmeId && { programmeId }), ...(division && { division }), page, limit: 25 };
  const list = useQuery({ queryKey: ["coach-students", f], queryFn: () => coachAccessApi.students(f), placeholderData: keepPreviousData });
  const reset = <T,>(set: (v: T) => void) => (v: T) => { setPage(1); set(v); };
  const levels = (divisions.data ?? []).filter((d) => d.isActive !== false);
  return (
    <PageFrame title="Students" description="Every student of your programmes, at every level. Contact details are not shown.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={reset(setQ)} placeholder="Name or username" label="Search students" />
        {list.data && list.data.programmes.length > 1 && (
          <SelectFilter label="Programme" value={programmeId} onChange={reset(setProgrammeId)}
            options={[{ label: "All my programmes", value: "" }, ...list.data.programmes.map((p) => ({ label: p.name, value: p.id }))]} />
        )}
        <SelectFilter label="Level" value={division} onChange={reset(setDivision)}
          options={[{ label: "Every level", value: "" }, ...levels.map((d) => ({ label: d.name, value: d.code }))]} />
      </div>
      {list.isPending ? <LoadingBlock /> : list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the students" onRetry={() => list.refetch()} />
      ) : list.data.programmes.length === 0 ? (
        <EmptyState title="No programme students to show" description="You are not a member of a programme, or seeing its students was turned off for you. Ask your Head Coach." />
      ) : (
        <TableCard footer={<Pagination page={list.data.meta.page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />}>
          <thead><tr className="border-b border-gray-100">
            <th className={th}>Student</th><th className={th}>Level</th><th className={th}>Grade</th><th className={th}>School</th><th className={th}>Olympiad subjects</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="coach-students">
            {list.data.data.length === 0 ? <TableMessage colSpan={5}>No student matches.</TableMessage> : list.data.data.map((s) => (
              <tr key={s.id} className="text-sm" data-testid={`coach-student-${s.username}`}>
                <td className={td}>
                  <Link href={`/mentor/profiles/${s.id}`} className="font-semibold text-indigo-700 hover:underline">{personName(s)}</Link>
                  <span className="ml-1 text-xs text-gray-600">@{s.username}</span>
                </td>
                <td className={`${td} text-gray-700`}>{s.division?.name ?? "—"}</td>
                <td className={`${td} text-gray-700`}>{s.gradeLevel ?? "—"}</td>
                <td className={`${td} text-gray-700`}>{s.school?.name ?? "—"}</td>
                <td className={`${td} text-gray-700`}>{[...s.olympiadInterests.map((x) => SUBJECT_LABEL[x] ?? x), ...(s.olympiadInterestOther ? [s.olympiadInterestOther] : [])].join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </PageFrame>
  );
}
