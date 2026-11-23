"use client";

/**
 * The teacher's students (`GET /teacher/students`, students.viewScoped — a Teacher default): verified students of the
 * schools an Administrator assigned to them, and (backends with teacherStudentAccess) students an Administrator
 * assigned to them directly. The backend decides which students appear; this page never widens it. On those
 * backends each row says how the teacher sees the student and what their permissions let them do for that student
 * (`access`, `can`); students still waiting for school verification are only counted, never named.
 * Backends with testSubmissionLock (owner 2026-11-21): every student who registered with the school code is listed,
 * pending verification included — nothing to wait for, so no "waiting" count.
 */
import { useState } from "react";
import Link from "next/link";
import type { GradeLevel } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { useTeacherStudents, useTeacherStudentsSummary } from "@/lib/queries/teacher";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { ABILITY_LABEL, abilities, accessBadges, homeworkDefaultSupported, pendingText, teacherStudentAccessSupported } from "@/lib/accounts/teacher-student-access";
import { personName } from "@/lib/format";
import { ErrorState } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { PageFrame } from "@/app/components/ui/PageFrame";
import { Badge, Notice, SearchInput, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "@/app/admin/components/adminUi";
import { TeacherTestsWidget } from "@/app/components/test-management/ResultViews";
import { submissionLockSupported } from "@/lib/test-management/submissions";

const GRADES: GradeLevel[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const PAGE_SIZE = 20;

export default function TeacherStudents() {
  const { can } = useSession();
  const [q, setQ] = useState("");
  const [grade, setGrade] = useState<"" | GradeLevel>("");
  const [page, setPage] = useState(1);
  const [access, setAccess] = useState<"" | "SCHOOL" | "ASSIGNED">("");
  const tsa = teacherStudentAccessSupported(useBackendCapabilities().detection);
  const selfService = submissionLockSupported(useBackendCapabilities().detection);
  // Course homework by default (owner 2026-11-24): open a student to see their homework and hand it in for them.
  const homework = homeworkDefaultSupported(useBackendCapabilities().detection) && (can("students.viewProgress") || can("submissions.submitOnBehalf"));
  const summary = useTeacherStudentsSummary(tsa);
  const students = useTeacherStudents({ q: q || undefined, gradeLevel: grade || undefined, ...(tsa && access && { access }), page, limit: PAGE_SIZE });

  const canOpen = can("students.viewProfile") || can("students.viewProgress") || can("submissions.submitOnBehalf");
  const pending = selfService ? null : pendingText(summary.data?.pendingVerification);
  const rows = students.data?.data ?? [];

  return (
    <PageFrame title="My students" description={selfService
      ? `Every student who registered with your school code appears here automatically. Submit their tests from Tests.${homework ? " Open a student to see their course homework and hand it in for them." : ""}`
      : tsa ? "Verified students of your schools, and students an administrator assigned to you." : "Students of the schools assigned to you by an administrator."}>
      {/* Tests (Phase 4 dashboard: capability testResults, tests.submitForStudents) */}
      <div className="mb-6"><TeacherTestsWidget /></div>
      {pending && (
        <div className="mb-4" data-testid="pending-students">
          <Notice tone="info">{pending}</Notice>
        </div>
      )}
      {!canOpen && !selfService && (
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
        {tsa && (
          <SelectFilter
            label="Shown because"
            value={access}
            onChange={(v) => {
              setAccess(v as "" | "SCHOOL" | "ASSIGNED");
              setPage(1);
            }}
            options={[
              { label: "All my students", value: "" },
              { label: "Students of my schools", value: "SCHOOL" },
              { label: "Assigned to me", value: "ASSIGNED" },
            ]}
          />
        )}
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
                  {q || grade || access
                    ? "No student matches these filters."
                    : selfService
                      ? "No students yet. Students appear here as soon as they register with your school code."
                      : "No students to show yet. Students appear here once an administrator has assigned you their school and verified their affiliation with it."}
                </TableMessage>
              ) : (
                rows.map((s) => {
                  // The backend's answer for this student when it gives one; otherwise the older rule (any permission).
                  const may = abilities(s.can);
                  const opens = may ? may.length > 0 : canOpen;
                  return (
                  <tr key={s.id} className="hover:bg-gray-50/50" data-testid="teacher-student-row">
                    <td className={td}>
                      <p className="font-semibold text-gray-800">{personName(s)}</p>
                      <p className="text-xs text-gray-500">@{s.username}</p>
                      {(accessBadges(s.access).length > 0 || (may && may.length > 0)) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {accessBadges(s.access).map((b) => (
                            <Badge key={b} className="bg-indigo-50 text-indigo-700">{b}</Badge>
                          ))}
                          {may?.map((a) => (
                            <Badge key={a} className="bg-emerald-50 text-emerald-700">{ABILITY_LABEL[a]}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={`${td} text-gray-600`}>{s.gradeLevel ?? "—"}</td>
                    <td className={`${td} text-gray-600`}>{s.division?.name ?? "—"}</td>
                    <td className={`${td} text-gray-600`}>{s.school?.name ?? "—"}</td>
                    {canOpen && (
                      <td className={`${td} text-right`}>
                        {opens ? (
                          <Link href={`/teacher/students/${s.id}`} className={linkBtn} aria-label={`Open ${personName(s)}`}>
                            Open
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-500" title="Your permissions do not cover this student.">No access</span>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
        </TableCard>
      )}
    </PageFrame>
  );
}
