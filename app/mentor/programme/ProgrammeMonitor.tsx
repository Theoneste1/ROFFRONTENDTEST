"use client";

/**
 * Head Coach monitoring, limited by the backend to the programmes the Head
 * Coach heads (`scopes.programmes` in GET /me/permissions; every route below
 * refuses any other programme and leaves out contact details):
 * - Students / Coaches: current members of the selected programme
 *   (GET /admin/programmes/:id/members — programmes.manageMembers)
 * - Student progress: GET /admin/reports/students (reports.view, programme-scoped)
 * - Coach activity: GET /admin/reports/mentors (coaches.monitor, programme-scoped)
 * Changes a Head Coach may make here: invite a new Coach into the programme
 * (users.manageCoaches; the account waits for an Administrator's approval) and
 * end a student's membership (programmes.manageMembers; students only). Adding
 * an existing student needs a way to find them, which the backend doesn't give
 * a Head Coach. Preparing and grading happen in Assignments and Reviews, only
 * through course × division assignments an Administrator created.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { programmesApi } from "@/lib/api/programmes";
import { queryKeys } from "@/lib/query/keys";
import CoachInvite from "./CoachInvite";
import type { Permission } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { formatDate, formatNumber, personName } from "@/lib/format";
import { useHeadedProgrammes, useProgrammeMembers } from "@/lib/queries/programmes";
import { useMentorReport, useStudentReport } from "@/lib/queries/admin";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, PageFrame } from "@/app/components/ui/PageFrame";
import { ConfirmDialog, Notice, SelectFilter, TableCard, TableMessage, linkBtn, td, th } from "@/app/admin/components/adminUi";

type Tab = "students" | "coaches" | "progress" | "activity";
const TABS: { value: Tab; label: string; permission: Permission }[] = [
  { value: "students", label: "Students", permission: "programmes.manageMembers" },
  { value: "coaches", label: "Coaches", permission: "programmes.manageMembers" },
  { value: "progress", label: "Student progress", permission: "reports.view" },
  { value: "activity", label: "Coach activity", permission: "coaches.monitor" },
];
const PAGE_SIZE = 20;

export default function ProgrammeMonitor() {
  const { can } = useSession();
  const headed = useHeadedProgrammes();
  const tabs = TABS.filter((t) => can(t.permission));
  const [tab, setTab] = useState<Tab | null>(null);
  const [programmeId, setProgrammeId] = useState<string | null>(null);
  const active = tab && tabs.some((t) => t.value === tab) ? tab : tabs[0]?.value ?? null;
  const selected = headed.programmes.find((p) => p.id === programmeId) ?? headed.programmes[0] ?? null;

  if (active === null) {
    return (
      <PageFrame title="My programme">
        <Notice tone="info">Programme monitoring is for Head Coaches.</Notice>
      </PageFrame>
    );
  }
  if (headed.loading) return <PageFrame title="My programme"><LoadingBlock /></PageFrame>;
  if (headed.error) {
    return (
      <PageFrame title="My programme">
        <ErrorState error={headed.error} title="Couldn't load your programmes" onRetry={headed.retry} />
      </PageFrame>
    );
  }
  if (!selected) {
    return (
      <PageFrame title="My programme">
        <Notice tone="info">You don&apos;t head a programme yet. An administrator appoints programme heads.</Notice>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title={headed.programmes.length > 1 ? "My programmes" : selected.name}
      description="Students and coaches of the programme you head. Contact details are not shown."
    >
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {headed.programmes.length > 1 && (
          <SelectFilter
            label="Programme"
            value={selected.id}
            onChange={setProgrammeId}
            options={headed.programmes.map((p) => ({ label: p.name, value: p.id }))}
          />
        )}
        <FilterPills label="View" options={tabs.map((t) => ({ label: t.label, value: t.value }))} value={active} onChange={(v) => setTab(v)} />
      </div>
      {active === "coaches" && can("users.manageCoaches") && <CoachInvite programmeId={selected.id} programmeName={selected.name} />}
      {(active === "students" || active === "coaches") && <Members programmeId={selected.id} role={active === "students" ? "STUDENT" : "MENTOR"} />}
      {(active === "progress" || active === "activity") && (
        <p className="text-xs text-gray-500 mb-3" data-testid="report-scope-note">
          {active === "progress" ? "Student progress" : "Coach activity"} covers all {headed.programmes.length > 1 ? `${headed.programmes.length} programmes` : "the programmes"} you head
          {headed.programmes.length > 1 ? ", not only the one selected above" : ""}, for the current academic year.
        </p>
      )}
      {active === "progress" && <StudentProgress />}
      {active === "activity" && <CoachActivity />}
    </PageFrame>
  );
}

function Members({ programmeId, role }: { programmeId: string; role: "STUDENT" | "MENTOR" }) {
  const [page, setPage] = useState(1);
  const members = useProgrammeMembers(programmeId, { role, page, limit: PAGE_SIZE });
  const qc = useQueryClient();
  const [ending, setEnding] = useState<{ id: string; name: string } | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const end = useMutation({
    mutationFn: (userId: string) => programmesApi.endMember(programmeId, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.programmes.all }),
  });
  // A Head Coach may end STUDENT memberships only (coaches leave through an Administrator).
  const { can } = useSession();
  const mayEnd = role === "STUDENT" && can("programmes.manageMembers");
  if (members.isError) return <ErrorState error={members.error} title="Couldn't load the members" onRetry={() => members.refetch()} />;
  const rows = members.data?.data ?? [];
  const student = role === "STUDENT";
  const cols = (student ? 5 : 2) + (mayEnd ? 1 : 0);
  return (
    <>
    {ended && <Notice tone="success" onClose={() => setEnded(null)}>{ended}</Notice>}
    <TableCard footer={members.data && <Pagination page={page} totalPages={members.data.meta.totalPages} total={members.data.meta.total} onPage={setPage} disabled={members.isFetching} />}>
      <thead className="bg-gray-50/60 border-b border-gray-100">
        <tr>
          <th className={th}>{student ? "Student" : "Coach"}</th>
          {student && <th className={th}>Grade</th>}
          {student && <th className={th}>Division</th>}
          {student && <th className={th}>School</th>}
          <th className={th}>Member since</th>
          {mayEnd && <th className={`${th} text-right`}>Actions</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50" data-testid={`members-${role}`}>
        {members.isPending ? (
          <TableMessage colSpan={cols}>Loading…</TableMessage>
        ) : rows.length === 0 ? (
          <TableMessage colSpan={cols}>{student ? "No students in this programme yet." : "No coaches in this programme yet."}</TableMessage>
        ) : (
          rows.map((m) => (
            <tr key={m.id}>
              <td className={td}>
                <p className="font-semibold text-gray-800">{personName(m)}</p>
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
              <td className={`${td} text-gray-600`}>{formatDate(m.membership.createdAt)}</td>
              {mayEnd && (
                <td className={`${td} text-right`}>
                  <button type="button" className={linkBtn} onClick={() => setEnding({ id: m.id, name: personName(m) })} aria-label={`End membership of ${personName(m)}`}>
                    End membership
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
    {ending && (
      <ConfirmDialog
        title="End this membership?"
        body={`${ending.name} leaves this programme. Their account, work and results are kept; an administrator can add them back.`}
        confirmLabel="End membership"
        tone="danger"
        onClose={() => setEnding(null)}
        onConfirm={async () => {
          await end.mutateAsync(ending.id);
          setEnded(`${ending.name} is no longer a member of this programme.`);
        }}
      />
    )}
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", INACTIVE: "Suspended", AWAITING_SETUP: "Awaiting setup" };

function StudentProgress() {
  const [page, setPage] = useState(1);
  const report = useStudentReport({ page, limit: PAGE_SIZE });
  if (report.isError) return <ErrorState error={report.error} title="Couldn't load student progress" onRetry={() => report.refetch()} />;
  const rows = report.data?.data ?? [];
  return (
    <TableCard footer={report.data && <Pagination page={page} totalPages={report.data.meta.totalPages} total={report.data.meta.total} onPage={setPage} disabled={report.isFetching} />}>
      <thead className="bg-gray-50/60 border-b border-gray-100">
        <tr>
          <th className={th}>Student</th>
          <th className={th}>Division</th>
          <th className={th}>Submissions</th>
          <th className={th}>Results published</th>
          <th className={th}>Points</th>
          <th className={th}>Last sign-in</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50" data-testid="student-progress">
        {report.isPending ? (
          <TableMessage colSpan={6}>Loading…</TableMessage>
        ) : rows.length === 0 ? (
          <TableMessage colSpan={6}>No students in your programmes yet.</TableMessage>
        ) : (
          rows.map((s) => (
            <tr key={s.id}>
              <td className={td}>
                <p className="font-semibold text-gray-800">{s.name}</p>
                <p className="text-xs text-gray-400">@{s.username} · {STATUS_LABEL[s.status] ?? s.status}</p>
              </td>
              <td className={`${td} text-gray-600`}>{s.division?.name ?? "—"}</td>
              <td className={`${td} text-gray-600`}>{formatNumber(s.submissions)}</td>
              <td className={`${td} text-gray-600`}>{formatNumber(s.resultsPublished)}</td>
              <td className={`${td} text-gray-600`}>{formatNumber(s.points)}</td>
              <td className={`${td} text-gray-600`}>{s.lastLoginAt ? formatDate(s.lastLoginAt) : "Never"}</td>
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
  );
}

function CoachActivity() {
  const [page, setPage] = useState(1);
  const report = useMentorReport({ page, limit: PAGE_SIZE });
  if (report.isError) return <ErrorState error={report.error} title="Couldn't load coach activity" onRetry={() => report.refetch()} />;
  const rows = report.data?.data ?? [];
  return (
    <TableCard footer={report.data && <Pagination page={page} totalPages={report.data.meta.totalPages} total={report.data.meta.total} onPage={setPage} disabled={report.isFetching} />}>
      <thead className="bg-gray-50/60 border-b border-gray-100">
        <tr>
          <th className={th}>Coach</th>
          <th className={th}>Teaching</th>
          <th className={th}>Open reviews</th>
          <th className={th}>Last sign-in</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50" data-testid="coach-activity">
        {report.isPending ? (
          <TableMessage colSpan={4}>Loading…</TableMessage>
        ) : rows.length === 0 ? (
          <TableMessage colSpan={4}>No coaches in your programmes yet.</TableMessage>
        ) : (
          rows.map((m) => (
            <tr key={m.id}>
              <td className={td}>
                <p className="font-semibold text-gray-800">{m.name}</p>
                <p className="text-xs text-gray-400">@{m.username} · {STATUS_LABEL[m.status] ?? m.status}</p>
              </td>
              <td className={`${td} text-gray-600`}>{m.teaching.length ? m.teaching.map((t) => `${t.course.title} (${t.division.name})`).join(", ") : "—"}</td>
              <td className={`${td} text-gray-600`}>{formatNumber(m.openReviews)}</td>
              <td className={`${td} text-gray-600`}>{m.lastLoginAt ? formatDate(m.lastLoginAt) : "Never"}</td>
            </tr>
          ))
        )}
      </tbody>
    </TableCard>
  );
}
