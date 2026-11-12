"use client";

/**
 * The students of the schools an Administrator assigned to this teacher
 * (`GET /teacher/students`, students.viewScoped — a Teacher default). The
 * backend decides which students appear; this page never widens it.
 * A student opens only when the teacher holds at least one of the
 * Administrator-granted permissions (profile, progress, submit on behalf).
 */
import { useState } from "react";
import Link from "next/link";
import type { GradeLevel } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useTeacherStudents } from "@/lib/queries/teacher";
import { personName } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Notice, SearchInput, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "@/app/admin/components/adminUi";

const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const PAGE_SIZE = 20;

export default function TeacherStudents() {
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<"" | GradeLevel>("");
  const [page, setPage] = useState(1);
  const students = useTeacherStudents({ q: q || undefined, gradeLevel: grade || undefined, page, limit: PAGE_SIZE });

  const canOpen = can("students.viewProfile") || can("students.viewProgress") || can("submissions.submitOnBehalf");
  const rows = students.data?.data ?? [];

  return (
    <PageFrame title="My students" description="Students of the schools assigned to you by an administrator.">
      {!canOpen && (
        <Notice tone="info">
          You can see the list of your students. To open a student&apos;s profile or progress, or to submit work for a student, an administrator must grant you that permission.
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
          placeholder="Search by name or username…"
          label="Search students"
        />
        <SelectFilter
          label="Grade"
          value={grade}
          onChange={(v) => {
            setGrade(v as "" | GradeLevel);
            setPage(1);
          }}
          options={[{ label: "All grades", value: "" }, ...GRADES.map((g) => ({ label: g, value: g }))]}
        />
      </div>

      {students.isError ? (
        <ErrorState error={students.error} title="Couldn't load your students" onRetry={() => students.refetch()} />
      ) : (
        <TableCard
          footer={
            students.data ? (
              <Pagination page={page} totalPages={students.data.meta.totalPages} total={students.data.meta.total} onPage={setPage} disabled={students.isFetching} />
            ) : undefined
          }
        >
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className={th}>Student</th>
                <th className={th}>Grade</th>
                <th className={th}>Division</th>
                <th className={th}>School</th>
                {canOpen && <th className={`${th} text-right`}>Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50" data-testid="teacher-students">
              {students.isPending ? (
                <TableMessage colSpan={canOpen ? 5 : 4}>Loading…</TableMessage>
              ) : rows.length === 0 ? (
                <TableMessage colSpan={canOpen ? 5 : 4}>
                  {q || grade ? "No student matches these filters." : "No students yet. An administrator assigns your schools."}
                </TableMessage>
              ) : (
                rows.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/50">
                    <td className={td}>
                      <p className="font-semibold text-gray-800">{personName(s)}</p>
                      <p className="text-xs text-gray-400">@{s.username}</p>
                    </td>
                    <td className={`${td} text-gray-600`}>{s.gradeLevel ?? "—"}</td>
                    <td className={`${td} text-gray-600`}>{s.division?.name ?? "—"}</td>
                    <td className={`${td} text-gray-600`}>{s.school?.name ?? "—"}</td>
                    {canOpen && (
                      <td className={`${td} text-right`}>
                        <Link href={`/teacher/students/${s.id}`} className={linkBtn} aria-label={`Open ${personName(s)}`}>
                          Open
                        </Link>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
        </TableCard>
      )}
    </PageFrame>
  );
}
