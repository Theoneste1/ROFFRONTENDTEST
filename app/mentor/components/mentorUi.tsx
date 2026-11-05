"use client";

/** Presentation helpers shared by the mentor pages. */
import { ChevronDown } from "lucide-react";
import type { AssignmentStatus, SubmissionStatus, TeachingScope } from "@/lib/api/types";
import { scopeKey, scopeLabel } from "@/lib/queries/mentor";

export const ASSIGNMENT_STATUS: Record<AssignmentStatus, { label: string; badge: string }> = {
  DRAFT: { label: "Draft", badge: "bg-slate-100 text-slate-600" },
  PENDING_APPROVAL: { label: "Pending approval", badge: "bg-amber-100 text-amber-700" },
  REJECTED: { label: "Returned by admin", badge: "bg-red-100 text-red-600" },
  PUBLISHED: { label: "Published", badge: "bg-green-100 text-green-700" },
  CLOSED: { label: "Closed", badge: "bg-blue-100 text-blue-700" },
  ARCHIVED: { label: "Archived", badge: "bg-gray-200 text-gray-600" },
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const s = ASSIGNMENT_STATUS[status];
  return <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.badge}`}>{s.label}</span>;
}

/** Submission status as the mentor sees it (backend `SubmissionStatus`). */
export const REVIEW_STATUS: Record<SubmissionStatus, { label: string; badge: string }> = {
  SUBMITTED: { label: "Awaiting distribution", badge: "bg-slate-100 text-slate-600" },
  ASSIGNED: { label: "Not reviewed", badge: "bg-purple-100 text-purple-700" },
  IN_REVIEW: { label: "In review", badge: "bg-blue-100 text-blue-700" },
  MARKED: { label: "Marked", badge: "bg-indigo-100 text-indigo-700" },
  SUBMITTED_TO_ADMIN: { label: "Awaiting admin approval", badge: "bg-amber-100 text-amber-700" },
  APPROVED: { label: "Approved", badge: "bg-emerald-100 text-emerald-700" },
  PUBLISHED: { label: "Published", badge: "bg-green-100 text-green-700" },
  REJECTED: { label: "Sent back by admin", badge: "bg-red-100 text-red-600" },
  RESUBMISSION_REQUESTED: { label: "Resubmission requested", badge: "bg-rose-100 text-rose-600" },
};

export function ReviewStatusBadge({ status }: { status: SubmissionStatus }) {
  const s = REVIEW_STATUS[status];
  return <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${s.badge}`}>{s.label}</span>;
}

/** Statuses where the mentor still has work to do. */
export const OPEN_REVIEW_STATUSES: SubmissionStatus[] = ["ASSIGNED", "IN_REVIEW", "MARKED", "REJECTED"];
/** Statuses where the mentor's part is done. */
export const DONE_REVIEW_STATUSES: SubmissionStatus[] = ["SUBMITTED_TO_ADMIN", "APPROVED", "PUBLISHED"];

/** Course × division selector fed by `GET /me/teaching`. */
export function ScopeSelect({
  scopes,
  value,
  onChange,
  includeAll,
  id = "scope",
  label = "Course",
}: {
  scopes: TeachingScope[];
  value: string;
  onChange: (key: string) => void;
  includeAll?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-9 py-2 text-sm font-medium text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
        >
          {includeAll && <option value="all">All my courses</option>}
          {scopes.map((s) => (
            <option key={s.id} value={scopeKey(s)}>
              {scopeLabel(s)}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

export function parseScopeKey(key: string | null | undefined): { courseId: string; divisionId: string } | null {
  if (!key || key === "all") return null;
  const [courseId, divisionId] = key.split(":");
  return courseId && divisionId ? { courseId, divisionId } : null;
}
