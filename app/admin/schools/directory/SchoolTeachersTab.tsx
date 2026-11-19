"use client";

/**
 * Teachers of a school (INT-07): the Teacher assignments of this school, current first, from
 * GET /admin/teacher-assignments?schoolId= (users.manageTeachers). Names and usernames only — never contact details.
 * Rules: lib/schools/school-teachers.ts.
 *
 * Primary teacher (owner decision 2026-11-19; backends with primaryTeacher): the school's main contact — the same rights
 * as every other teacher — shown above the list ("No primary teacher" when none) and as a Primary / Secondary badge on
 * each current teacher. "Make primary" (confirmed) makes a secondary teacher the primary; the previous one becomes
 * secondary. Rules: lib/schools/primary-teacher.ts.
 */
import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teachersAdminApi, type TeacherSchoolAssignment } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { SCHOOL_TEACHER_FILTERS, assignmentPeriod, type SchoolTeacherFilter } from "@/lib/schools/school-teachers";
import {
  NO_PRIMARY_TEACHER, canMakePrimary, displayedRole, makePrimaryText, primaryTeacherLine, primaryTeacherSupported,
} from "@/lib/schools/primary-teacher";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import TeacherRoleBadge from "@/app/components/teachers/TeacherRoleBadge";
import { Badge, ConfirmDialog, FilterPills, TableCard, TableMessage, linkBtn, td, th } from "../../components/adminUi";

export default function SchoolTeachersTab({ schoolId, schoolName = "this school" }: { schoolId: string; schoolName?: string }) {
  const [filter, setFilter] = useState<SchoolTeacherFilter>("current");
  const [page, setPage] = useState(1);
  const [choosing, setChoosing] = useState<TeacherSchoolAssignment | null>(null);
  const qc = useQueryClient();
  const primaryOn = primaryTeacherSupported(useBackendCapabilities().detection);
  const isActive = filter === "current" ? true : filter === "ended" ? false : undefined;
  const list = useQuery({
    queryKey: queryKeys.schoolDirectory.teachers(schoolId, filter, page),
    queryFn: () => teachersAdminApi.bySchool(schoolId, { page, isActive }),
    placeholderData: keepPreviousData,
  });
  const primary = useQuery({
    queryKey: queryKeys.schoolDirectory.primaryTeacher(schoolId),
    queryFn: () => teachersAdminApi.primaryOf(schoolId),
    enabled: primaryOn,
  });
  const makePrimary = useMutation({
    mutationFn: (assignmentId: string) => teachersAdminApi.makePrimary(assignmentId),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.schoolDirectory.all }),
  });
  const cols = primaryOn ? 5 : 4;
  return (
    <>
      {primaryOn && (
        <p className="mb-3 text-sm text-gray-700" data-testid="school-primary-teacher">
          <span className="font-semibold text-gray-800">Primary teacher: </span>
          {primary.isPending ? (
            "…"
          ) : primary.isError ? (
            <span className="text-red-700">couldn&apos;t load</span>
          ) : primary.data ? (
            <Link href={`/admin/users/${primary.data.teacher.id}`} className="text-indigo-700 hover:underline">
              {primaryTeacherLine(primary.data.teacher)}
            </Link>
          ) : (
            <span className="text-gray-600">{NO_PRIMARY_TEACHER}</span>
          )}
          <span className="block text-xs text-gray-500">The school&apos;s main contact. Primary and secondary teachers have the same rights.</span>
        </p>
      )}
      <div className="mb-3">
        <FilterPills
          label="Teachers"
          options={[...SCHOOL_TEACHER_FILTERS]}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(1);
          }}
        />
      </div>
      {list.isError ? (
        <ErrorState error={list.error} title="Couldn't load the teachers" onRetry={() => list.refetch()} />
      ) : (
        <TableCard
          footer={
            list.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={list.data.meta.totalPages} total={list.data.meta.total} onPage={setPage} disabled={list.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>Teacher</th>
              {primaryOn && <th className={th}>Role</th>}
              <th className={th}>Assignment</th>
              <th className={th}>Period</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="school-teachers">
            {list.isPending ? (
              <TableMessage colSpan={cols}>Loading teachers…</TableMessage>
            ) : list.data.data.length === 0 ? (
              <TableMessage colSpan={cols}>{filter === "current" ? "No teacher is assigned to this school." : "No teachers."}</TableMessage>
            ) : (
              list.data.data.map((a) => {
                const role = displayedRole(a);
                return (
                  <tr key={a.id} className="text-xs">
                    <td className={`${td} font-semibold text-gray-800`}>
                      {a.teacher.firstName} {a.teacher.lastName}
                      <span className="block text-[11px] font-normal text-gray-500">@{a.teacher.username}</span>
                    </td>
                    {primaryOn && <td className={td}>{role ? <TeacherRoleBadge role={role} /> : <span className="text-gray-500">—</span>}</td>}
                    <td className={td}>
                      <Badge className={a.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}>{a.isActive ? "Current" : "Ended"}</Badge>
                    </td>
                    <td className={`${td} text-gray-600`}>{assignmentPeriod(a, formatDate)}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/admin/users/${a.teacher.id}`} className={linkBtn}>
                        View
                      </Link>
                      {primaryOn && canMakePrimary(a, true) && (
                        <button type="button" className={`${linkBtn} ml-3`} onClick={() => setChoosing(a)} disabled={makePrimary.isPending}>
                          Make primary
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}
      {choosing && (
        <ConfirmDialog
          title="Change the primary teacher?"
          body={makePrimaryText(
            `${choosing.teacher.firstName} ${choosing.teacher.lastName}`,
            primary.data ? primaryTeacherLine(primary.data.teacher) : null,
            schoolName,
          )}
          confirmLabel="Make primary"
          onClose={() => setChoosing(null)}
          onConfirm={() => makePrimary.mutateAsync(choosing.id)}
        />
      )}
    </>
  );
}
