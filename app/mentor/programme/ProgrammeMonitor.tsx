"use client";

/**
 * Head Coach monitoring, limited by the backend to the programmes the Head
 * Coach heads (`scopes.programmes` in GET /me/permissions; every route below
 * refuses any other programme and leaves out contact details). Each view is
 * shown only with the permission its route needs (GET /me/permissions):
 * - Overview: GET /admin/dashboard (reports.view) and GET /admin/activity/summary
 *   (activity.view) — no moderation, account-wide or score figures
 * - Students / Coaches: current members of the selected programme
 *   (GET /admin/programmes/:id/members — programmes.manageMembers)
 * - Course access: coaches' course × division assignments
 *   (/admin/mentor-assignments — mentorAssignments.manage, programme scope)
 * - Courses: GET /admin/reports/course-participation (reports.view) and
 *   GET /analytics/courses/:id (analytics.course), without score aggregates
 * - Student progress: GET /admin/reports/students (reports.view)
 * - Coach activity: GET /admin/reports/mentors (coaches.monitor)
 * - Activity log: GET /admin/activity (activity.view)
 * Changes a Head Coach may make here: invite a new Coach into the programme
 * (users.manageCoaches; the account waits for an Administrator's approval), end a
 * student's membership and add it back (programmes.manageMembers; students only),
 * and give or remove member coaches' course access (mentorAssignments.manage).
 * Adding a student who is not a member yet needs a student search, which the
 * backend doesn't give a Head Coach (users.view is used by no route). Preparing and
 * grading happen in Assignments and Reviews, only through course × division
 * assignments an Administrator created.
 */
import { useState } from "react";
import CoachInvite from "./CoachInvite";
import CoachCourseAccess from "./CoachCourseAccess";
import ProgrammeActivity from "./ProgrammeActivity";
import ProgrammeCourses from "./ProgrammeCourses";
import ProgrammeOverview from "./ProgrammeOverview";
import type { Permission } from "@/lib/api/types";
import { useSession } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";
import { memberRolesManaged, peopleSearch } from "@/lib/programmes/programme-rules";
import { useHeadedProgrammes, useProgrammeParticipation } from "@/lib/queries/programmes";
import { useMentorReport, useStudentReport } from "@/lib/queries/admin";
import ProgrammeMembers from "@/app/components/programmes/ProgrammeMembers";
import { ErrorState, LoadingBlock } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { FilterPills, PageFrame } from "@/app/components/ui/PageFrame";
import { Notice, SelectFilter, TableCard, TableMessage, td, th } from "@/app/admin/components/adminUi";

type Tab = "overview" | "students" | "coaches" | "access" | "courses" | "progress" | "activity" | "log";
/** Each view and the permissions (any of them) its routes need. */
const TABS: { value: Tab; label: string; anyOf: Permission[] }[] = [
  { value: "overview", label: "Overview", anyOf: ["reports.view", "activity.view"] },
  { value: "students", label: "Students", anyOf: ["programmes.manageMembers"] },
  { value: "coaches", label: "Coaches", anyOf: ["programmes.manageMembers"] },
  { value: "access", label: "Course access", anyOf: ["mentorAssignments.manage"] },
  { value: "courses", label: "Courses", anyOf: ["reports.view"] },
  { value: "progress", label: "Student progress", anyOf: ["reports.view"] },
  { value: "activity", label: "Coach activity", anyOf: ["coaches.monitor"] },
  { value: "log", label: "Activity log", anyOf: ["activity.view"] },
];
/** Views whose figures cover every programme the Head Coach heads (these routes take no programme filter). */
const ALL_PROGRAMMES: Partial<Record<Tab, string>> = {
  overview: "These figures cover",
  courses: "Courses cover",
  progress: "Student progress covers",
  activity: "Coach activity covers",
  log: "The activity log covers",
};
const PAGE_SIZE = 20;

export default function ProgrammeMonitor() {
  const { can, role } = useSession();
  const headed = useHeadedProgrammes();
  const tabs = TABS.filter((t) => t.anyOf.some((p) => can(p)));
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
      {(active === "students" || active === "coaches") && (
        <ProgrammeMembers
          key={`${selected.id}:${active}`}
          programmeId={selected.id}
          role={active === "students" ? "STUDENT" : "MENTOR"}
          managed={memberRolesManaged(role, can)}
          search={peopleSearch(role, can)}
        />
      )}
      {ALL_PROGRAMMES[active] && (
        <p className="text-xs text-gray-600 mb-3" data-testid="report-scope-note">
          {ALL_PROGRAMMES[active]} all {headed.programmes.length > 1 ? `${headed.programmes.length} programmes` : "the programmes"} you head
          {headed.programmes.length > 1 ? ", not only the one selected above" : ""}
          {active === "log" ? "." : ", for the current academic year."}
        </p>
      )}
      {active === "overview" && <ProgrammeOverview showDashboard={can("reports.view")} showActivity={can("activity.view")} />}
      {active === "access" && <CoachCourseAccess key={selected.id} programmeId={selected.id} />}
      {active === "courses" && <ProgrammeCourses />}
      {active === "progress" && <StudentProgress />}
      {active === "activity" && <CoachActivity />}
      {active === "log" && <ActivityLogView />}
    </PageFrame>
  );
}

/** The activity log, with course titles from the participation report when it is available. */
function ActivityLogView() {
  const { can } = useSession();
  const participation = useProgrammeParticipation(can("reports.view"));
  const titles = new Map((participation.data?.rows ?? []).map((r) => [r.course.id, r.course.title]));
  return <ProgrammeActivity courseTitle={(id) => titles.get(id)} />;
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
                <p className="text-xs text-gray-500">@{s.username} · {STATUS_LABEL[s.status] ?? s.status}</p>
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
                <p className="text-xs text-gray-500">@{m.username} · {STATUS_LABEL[m.status] ?? m.status}</p>
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
