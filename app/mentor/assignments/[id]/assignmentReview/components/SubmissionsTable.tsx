'use client';

import React from "react";
import Link from "next/link";
import { FileText, Type } from "lucide-react";
import type { ReviewSubmission } from "@/lib/api/types";
import { formatDate, formatTime } from "@/lib/format";
import { OPEN_REVIEW_STATUSES, ReviewStatusBadge } from "../../../../components/mentorUi";

/** Submissions assigned to the mentor (original table design). */
export default function SubmissionsTable({ assignmentId, maximumMarks, rows }: { assignmentId: string; maximumMarks: number; rows: ReviewSubmission[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto relative">
        <div className="min-w-[680px]">
          <div className="bg-[#DCE3F2] px-6 py-3.5 grid grid-cols-12 text-sm font-semibold text-slate-700 border-b border-slate-200">
            <div className="col-span-4">Student</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-1">Score</div>
            <div className="col-span-2">Submitted</div>
            <div className="col-span-2">Actions</div>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((s) => {
              const hasFiles = s.files.length > 0;
              const open = OPEN_REVIEW_STATUSES.includes(s.status);
              return (
                <div key={s.id} className="px-6 py-4 grid grid-cols-12 items-center text-sm hover:bg-slate-50/80 transition">
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${hasFiles ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-500"}`} title={hasFiles ? "Files" : "Typed answer"}>
                      {hasFiles ? <FileText className="w-5 h-5" /> : <Type className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 truncate">
                        {s.student.firstName} {s.student.lastName}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {s.student.gradeLevel ?? ""}
                        {s.revisions.length > 1 && ` · attempt ${s.revisions.length}`}
                        {s.isLate && <span className="text-orange-600"> · late</span>}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <ReviewStatusBadge status={s.status} />
                  </div>
                  <div className="col-span-1 font-bold text-slate-800">{s.review?.score !== null && s.review?.score !== undefined ? `${s.review.score}/${maximumMarks}` : "—"}</div>
                  <div className="col-span-2 text-xs text-slate-600 font-medium leading-relaxed">
                    <div>{formatDate(s.submittedAt)}</div>
                    <div className="text-slate-400">{formatTime(s.submittedAt)}</div>
                  </div>
                  <div className="col-span-2">
                    <Link
                      href={`/mentor/assignments/${assignmentId}/assignmentReview/${s.id}`}
                      className={
                        open
                          ? "px-5 py-1.5 bg-[#2B2BB2] text-white hover:bg-indigo-800 rounded-xl font-medium text-xs transition"
                          : "px-4 py-1.5 border border-blue-500 text-blue-600 hover:bg-blue-50 rounded-xl font-medium text-xs transition"
                      }
                    >
                      {open ? "Review" : "View"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
