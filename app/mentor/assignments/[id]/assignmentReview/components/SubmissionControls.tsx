'use client';

import React from "react";
import { Search } from "lucide-react";

export interface ControlsState {
  search: string;
  /** "all" | "open" | "done" | a SubmissionStatus */
  status: string;
  sort: "submitted" | "name" | "score";
}

export default function SubmissionControls({ value, onChange }: { value: ControlsState; onChange: (v: ControlsState) => void }) {
  const select = "bg-white border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 outline-none cursor-pointer";
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="relative w-full sm:w-80">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Search students by name..."
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          aria-label="Search students"
          className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap sm:flex-nowrap">
        <select className={select} value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value })} aria-label="Filter by status">
          <option value="all">All Statuses</option>
          <option value="open">Not Reviewed (to do)</option>
          <option value="done">Reviewed (submitted to admin)</option>
          <option value="ASSIGNED">Not started</option>
          <option value="IN_REVIEW">In review</option>
          <option value="MARKED">Marked</option>
          <option value="REJECTED">Sent back by admin</option>
          <option value="RESUBMISSION_REQUESTED">Resubmission requested</option>
          <option value="PUBLISHED">Published</option>
        </select>
        <select className={select} value={value.sort} onChange={(e) => onChange({ ...value, sort: e.target.value as ControlsState["sort"] })} aria-label="Sort by">
          <option value="submitted">Sort: Submitted date</option>
          <option value="name">Sort: Name (A–Z)</option>
          <option value="score">Sort: Score (high–low)</option>
        </select>
      </div>
    </div>
  );
}
