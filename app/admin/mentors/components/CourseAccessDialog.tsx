"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { errorMessage } from "@/lib/api/errors";
import { useAdminDivisions, useAdminUser, useMentorScopes, useScopeAction } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";
import { Modal, btnPrimary } from "../../components/adminUi";

/**
 * A mentor's course × division access (`/admin/mentor-assignments`). Adding
 * re-activates an earlier grant; removing deactivates it and reports open
 * reviews that should be reassigned.
 */
export default function CourseAccessDialog({ mentorId, mentorName, onClose }: { mentorId: string; mentorName?: string; onClose: () => void }) {
  const scopes = useMentorScopes(mentorId);
  const mentor = useAdminUser(mentorName ? undefined : mentorId);
  const courses = useCourses();
  const divisions = useAdminDivisions();
  const action = useScopeAction();
  const [courseId, setCourseId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const name = mentorName ?? (mentor.data ? `${mentor.data.firstName} ${mentor.data.lastName}` : "this coach");
  const isMentor = mentorName !== undefined || !mentor.data || mentor.data.role === "MENTOR";
  const active = scopes.data?.data ?? [];
  const has = (c: string, d: string) => active.some((s) => s.course.id === c && s.division.id === d);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!courseId || !divisionId) return setMessage({ tone: "error", text: "Choose a course and a division." });
    if (has(courseId, divisionId)) return setMessage({ tone: "info", text: "This coach already has that access." });
    setMessage(null);
    try {
      const s = await action.mutateAsync({ type: "add", mentorId, courseId, divisionId });
      setMessage({ tone: "success", text: `Access added: ${s.course.title} · ${s.division.name}.` });
      setCourseId("");
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  }

  async function remove(scopeId: string, label: string) {
    setRemoving(scopeId);
    setMessage(null);
    try {
      const r = await action.mutateAsync({ type: "remove", scopeId });
      const open = (r as { openReviewsToReassign?: number }).openReviewsToReassign ?? 0;
      setMessage(
        open > 0
          ? { tone: "info", text: `Access to ${label} removed. ${open} open review${open === 1 ? "" : "s"} in this course should be reassigned to another coach (assignment page → submissions).` }
          : { tone: "success", text: `Access to ${label} removed.` },
      );
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Modal wide title={`Course access — ${name}`} onClose={action.isPending ? () => undefined : onClose}>
      <p className="text-xs text-gray-500 mb-4">A coach prepares assignments, reviews submissions and manages resources only in the courses and divisions listed here.</p>
      {!isMentor ? (
        <Alert tone="error">This account is not a coach. Change its role on the user page first.</Alert>
      ) : scopes.isPending ? (
        <LoadingBlock />
      ) : scopes.isError ? (
        <ErrorState error={scopes.error} onRetry={() => scopes.refetch()} />
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Current access</h3>
            {active.length === 0 ? (
              <p className="text-sm text-amber-600 font-semibold">No access yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
                {active.map((s) => {
                  const label = `${s.course.title} · ${s.division.name}`;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">{label}</span>
                      <button
                        type="button"
                        onClick={() => remove(s.id, label)}
                        disabled={action.isPending}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 shrink-0"
                        aria-label={`Remove access to ${label}`}
                      >
                        {removing === s.id ? <Spinner className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />} Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <form onSubmit={add} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Course
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal min-w-[180px]">
                <option value="">Choose…</option>
                {(courses.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Division
              <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-normal min-w-[160px]">
                <option value="">Choose…</option>
                {(divisions.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={action.isPending} className={btnPrimary}>
              {action.isPending && action.variables?.type === "add" ? <Spinner className="h-3.5 w-3.5 !text-white" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
              Add access
            </button>
          </form>
        </div>
      )}
      {message && (
        <div className="mt-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
    </Modal>
  );
}
