"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSchools } from "@/lib/queries/admin";
import { hasFeature } from "@/lib/api/capabilities";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { formatNumber } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { AdminPage, SearchInput, TableCard, TableMessage, btnSecondary, linkBtn, td, th } from "../components/adminUi";

/**
 * Read-only list of schools (`GET /schools`). The backend has no endpoint to
 * create, rename or delete schools: they are created by invitations, CSV
 * imports and student registration.
 */
export default function SchoolsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const schools = useSchools({ search: search || undefined, page, limit: 20 });
  const { can } = useSession();
  // Students' school claims: on a backend with school affiliations, for holders of schools.manage.
  const review = hasFeature(useBackendCapabilities().detection, "schoolAffiliations") && can("schools.manage");

  return (
    <AdminPage
      title="Schools"
      description="Schools are added automatically when students register or are invited. They cannot be edited here."
      actions={
        review ? (
          <Link href="/admin/schools/affiliations" className={btnSecondary}>
            School verification
          </Link>
        ) : undefined
      }
    >
      <Link href="/admin/students" className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Students
      </Link>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search schools…"
          label="Search schools"
        />
      </div>
      {schools.isError ? (
        <ErrorState error={schools.error} title="Couldn't load schools" onRetry={() => schools.refetch()} />
      ) : (
        <TableCard
          footer={
            schools.data && (
              <div className="px-4 pb-4">
                <Pagination page={page} totalPages={schools.data.meta.totalPages} total={schools.data.meta.total} onPage={setPage} disabled={schools.isFetching} />
              </div>
            )
          }
        >
          <thead>
            <tr className="border-b border-gray-100">
              <th className={th}>School</th>
              <th className={th}>Location</th>
              <th className={th}>Students</th>
              <th className={th}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className={`divide-y divide-gray-100/80 ${schools.isFetching && schools.data ? "opacity-60" : ""}`}>
            {schools.isPending ? (
              <TableMessage colSpan={4}>Loading schools…</TableMessage>
            ) : schools.data.data.length === 0 ? (
              <TableMessage colSpan={4}>No schools found.</TableMessage>
            ) : (
              schools.data.data.map((s) => (
                <tr key={s.id} className="text-xs hover:bg-gray-50/60">
                  <td className={`${td} font-semibold text-gray-800`}>{s.name}</td>
                  <td className={`${td} text-gray-500`}>{s.location}</td>
                  <td className={`${td} text-gray-600`}>{formatNumber(s._count.students)}</td>
                  <td className={td}>
                    <Link href={`/admin/schools/${s.id}`} className={linkBtn} aria-label={`View students of ${s.name}`}>
                      Students
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}
    </AdminPage>
  );
}
