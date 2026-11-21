"use client";

/**
 * Coach course access in the programmes a Head Coach heads
 * (/admin/mentor-assignments, mentorAssignments.manage — programme scope):
 * the backend lists only Coaches' assignments on the programmes' courses and
 * accepts a new one only for a Coach who is a member of the course's programme
 * (never the Head Coach, another Head Coach or an administrator).
 *
 * Choices offered: the selected programme's member coaches
 * (GET /admin/programmes/:id/members?role=MENTOR) and the programme courses ×
 * divisions from the participation report (reports.view).
 */
import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { formatDate, personName } from "@/lib/format";
import { courseAccessError, programmeCourses, reportDivisions } from "@/lib/programmes/programme-rules";
import { useCoachAccess, useCoachAccessAction, useProgrammeMembers, useProgrammeParticipation } from "@/lib/queries/programmes";
import { Alert, ErrorState, Spinner } from "@/app/components/ui/feedback";
import Pagination from "@/app/components/ui/Pagination";
import { TableCard, TableMessage, btnPrimary, td, th } from "@/app/admin/components/adminUi";

const PAGE_SIZE = 25;
const selectCls = "border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal min-w-[180px] bg-white";

function changeError(e: unknown) {
  return (isApiError(e) && courseAccessError(e.code, e.status)) || errorMessage(e);
}

export default function CoachCourseAccess({ programmeId }: { programmeId: string }) {
  const [page, setPage] = useState(1);
  const access = useCoachAccess({ page, limit: PAGE_SIZE }, true);
  const coaches = useProgrammeMembers(programmeId, { role: "MENTOR", limit: 100 });
  const participation = useProgrammeParticipation(true);
  const action = useCoachAccessAction();
  const [form, setForm] = useState({ mentorId: "", courseId: "", divisionId: "" });
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const courseList = programmeCourses(participation.data?.rows ?? []);
  const divisions = reportDivisions(participation.data?.rows ?? []);
  const coachList = coaches.data?.data ?? [];
  const rows = access.data?.data ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.mentorId || !form.courseId || !form.divisionId) return setMessage({ tone: "error", text: "Choose a coach, a course and a division." });
    setMessage(null);
    try {
      const s = await action.mutateAsync({ type: "add", ...form });
      setMessage({ tone: "success", text: `${personName(s.mentor)} can now teach ${s.course.title} · ${s.division.name}.` });
      setForm((f) => ({ ...f, courseId: "" }));
    } catch (err) {
      setMessage({ tone: "error", text: changeError(err) });
    }
  }

  async function remove(id: string, label: string) {
    setMessage(null);
    try {
      const r = await action.mutateAsync({ type: "remove", scopeId: id });
      const open = (r as { openReviewsToReassign?: number }).openReviewsToReassign ?? 0;
      setMessage(
        open > 0
          ? { tone: "info", text: `Access to ${label} removed. ${open} open review${open === 1 ? "" : "s"} should be reassigned by an administrator.` }
          : { tone: "success", text: `Access to ${label} removed.` },
      );
    } catch (err) {
      setMessage({ tone: "error", text: changeError(err) });
    }
  }

  return (
    <div className="space-y-4" data-testid="coach-course-access">
      <p className="text-xs text-gray-600">
        A coach prepares assignments, reviews submissions and manages resources only in the courses and divisions given here. You can give access to coaches of your
        programme, on your programme&apos;s courses.
      </p>

      <form onSubmit={add} className="flex flex-wrap items-end gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Coach
          <select aria-label="Coach" value={form.mentorId} onChange={(e) => setForm((f) => ({ ...f, mentorId: e.target.value }))} className={selectCls} disabled={coaches.isPending}>
            <option value="">{coaches.isPending ? "Loading…" : coachList.length ? "Choose…" : "No coaches in this programme"}</option>
            {coachList.map((c) => (
              <option key={c.id} value={c.id}>
                {personName(c)} (@{c.username})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Course
          <select aria-label="Course" value={form.courseId} onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))} className={selectCls} disabled={participation.isPending}>
            <option value="">{participation.isPending ? "Loading…" : "Choose…"}</option>
            {courseList.map((c) => (
              <option key={c.course.id} value={c.course.id}>
                {c.course.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Division
          <select aria-label="Division" value={form.divisionId} onChange={(e) => setForm((f) => ({ ...f, divisionId: e.target.value }))} className={`${selectCls} min-w-[150px]`}>
            <option value="">Choose…</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={action.isPending} className={btnPrimary}>
          {action.isPending && action.variables?.type === "add" ? <Spinner className="h-3.5 w-3.5 !text-white" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
          Give access
        </button>
      </form>
      {(coaches.isError || participation.isError) && <Alert tone="error">{errorMessage(coaches.error ?? participation.error)}</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {access.isError ? (
        <ErrorState error={access.error} title="Couldn't load coach course access" onRetry={() => access.refetch()} />
      ) : (
        <TableCard footer={access.data && <Pagination page={page} totalPages={access.data.meta.totalPages} total={access.data.meta.total} onPage={setPage} disabled={access.isFetching} />}>
          <thead className="bg-gray-50/60 border-b border-gray-100">
            <tr>
              <th className={th}>Coach</th>
              <th className={th}>Course</th>
              <th className={th}>Division</th>
              <th className={th}>Since</th>
              <th className={`${th} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50" data-testid="coach-access-rows">
            {access.isPending ? (
              <TableMessage colSpan={5}>Loading…</TableMessage>
            ) : rows.length === 0 ? (
              <TableMessage colSpan={5}>No coach has course access in your programmes yet.</TableMessage>
            ) : (
              rows.map((s) => {
                const label = `${s.course.title} · ${s.division.name}`;
                return (
                  <tr key={s.id}>
                    <td className={td}>
                      <p className="font-semibold text-gray-800">{personName(s.mentor)}</p>
                      <p className="text-xs text-gray-500">@{s.mentor.username}</p>
                    </td>
                    <td className={`${td} text-gray-600`}>{s.course.title}</td>
                    <td className={`${td} text-gray-600`}>{s.division.name}</td>
                    <td className={`${td} text-gray-600`}>{formatDate(s.updatedAt)}</td>
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        onClick={() => void remove(s.id, `${personName(s.mentor)} — ${label}`)}
                        disabled={action.isPending}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                        aria-label={`Remove ${personName(s.mentor)}'s access to ${label}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
