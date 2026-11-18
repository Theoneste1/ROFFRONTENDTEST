"use client";

/**
 * Teachers of a school (INT-07): the Teacher assignments of this school, current first, from
 * GET /admin/teacher-assignments?schoolId= (users.manageTeachers). Names and usernames only — never contact details.
 * Rules: lib/schools/school-teachers.ts.
 */
import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { teachersAdminApi } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import { SCHOOL_TEACHER_FILTERS, assignmentPeriod, type SchoolTeacherFilter } from "@/lib/schools/school-teachers";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { Badge, FilterPills, TableCard, TableMessage, linkBtn, td, th } from "../../components/adminUi";

export default function SchoolTeachersTab({ schoolId }: { schoolId: string }) {
  const [filter, setFilter] = useState<SchoolTeacherFilter>("current");
  const [page, setPage] = useState(1);
  const isActive = filter === "current" ? true : filter === "ended" ? false : undefined;
  const list = useQuery({
    queryKey: queryKeys.schoolDirectory.teachers(schoolId, filter, page),
    queryFn: () => teachersAdminApi.bySchool(schoolId, { page, isActive }),
    placeholderData: keepPreviousData,
  });
  return (
    <>
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
              <th className={th}>Assignment</th>
              <th className={th}>Period</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80" data-testid="school-teachers">
            {list.isPending ? (
              <TableMessage colSpan={4}>Loading teachers…</TableMessage>
            ) : list.data.data.length === 0 ? (
              <TableMessage colSpan={4}>{filter === "current" ? "No teacher is assigned to this school." : "No teachers."}</TableMessage>
            ) : (
              list.data.data.map((a) => (
                <tr key={a.id} className="text-xs">
                  <td className={`${td} font-semibold text-gray-800`}>
                    {a.teacher.firstName} {a.teacher.lastName}
                    <span className="block text-[11px] font-normal text-gray-500">@{a.teacher.username}</span>
                  </td>
                  <td className={td}>
                    <Badge className={a.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}>{a.isActive ? "Current" : "Ended"}</Badge>
                  </td>
                  <td className={`${td} text-gray-600`}>{assignmentPeriod(a, formatDate)}</td>
                  <td className={td}>
                    <Link href={`/admin/users/${a.teacher.id}`} className={linkBtn}>
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </>
  );
}
