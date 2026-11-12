"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSchool } from "@/lib/queries/admin";
import { isApiError } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, Badge, TableCard, TableMessage, linkBtn, td, th } from "../../components/adminUi";

/** A school and its students (`GET /schools/:id`), read-only. */
export default function ReadOnlySchoolDetail({ schoolId }: { schoolId: string }) {
  const [page, setPage] = useState(1);
  const school = useSchool(schoolId, page);
  const back = (
    <Link href="/admin/schools" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All schools
    </Link>
  );

  if (school.isPending) return <AdminPage title="School">{back}<LoadingBlock /></AdminPage>;
  if (school.isError)
    return (
      <AdminPage title="School">
        {back}
        <ErrorState error={school.error} title={isApiError(school.error) && school.error.status === 404 ? "School not found" : "Couldn't load this school"} onRetry={() => school.refetch()} />
      </AdminPage>
    );

  const s = school.data;
  return (
    <AdminPage title={s.name} description={`${s.location} · ${formatNumber(s.students.meta.total)} student${s.students.meta.total === 1 ? "" : "s"}`}>
      {back}
      <TableCard
        footer={
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={s.students.meta.totalPages} total={s.students.meta.total} onPage={setPage} disabled={school.isFetching} />
          </div>
        }
      >
        <thead>
          <tr className="border-b border-gray-100">
            <th className={th}>Student</th>
            <th className={th}>Division</th>
            <th className={th}>Points</th>
            <th className={th}>Status</th>
            <th className={th}>
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100/80">
          {s.students.data.length === 0 ? (
            <TableMessage colSpan={5}>No students at this school.</TableMessage>
          ) : (
            s.students.data.map((st) => (
              <tr key={st.id} className="text-xs hover:bg-gray-50/60">
                <td className={`${td} font-semibold text-gray-800 whitespace-nowrap`}>
                  {st.firstName} {st.lastName}
                  <span className="block text-[11px] font-normal text-gray-400">@{st.username}</span>
                </td>
                <td className={`${td} text-gray-600 whitespace-nowrap`}>
                  {st.division?.name.replace(/ division$/i, "") ?? "—"}
                  {st.gradeLevel && <span className="text-gray-400"> · {st.gradeLevel}</span>}
                </td>
                <td className={`${td} text-gray-600`}>{formatNumber(st.points)}</td>
                <td className={td}>
                  <Badge className={st.isActive ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}>{st.isActive ? "Active" : "Suspended"}</Badge>
                </td>
                <td className={td}>
                  <Link href={`/admin/users/${st.id}`} className={linkBtn}>
                    View
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
    </AdminPage>
  );
}
