import React from "react";
import Link from "next/link";
import { FileText, Zap, Info, ChevronRight, Edit, BookOpen } from "lucide-react";
import type { MentorAssignment } from "@/lib/api/types";
import { formatDateTime, personName } from "@/lib/format";

/** Assignment details, quick links and the review workflow (original sidebar design). */
export default function AssignmentSidebar({ assignment: a }: { assignment: MentorAssignment }) {
  const editable = a.status === "DRAFT" || a.status === "REJECTED";
  const link = "w-full py-2.5 flex items-center justify-between text-slate-700 hover:text-blue-600 transition group text-left";
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 font-bold text-slate-900 mb-4 text-sm">
          <FileText className="w-4 h-4 text-blue-600" />
          <span>Assignment Details</span>
        </div>
        <div className="space-y-3 text-xs">
          <Row label="Course" value={a.course.title} />
          <Row label="Division" value={`${a.division.name} division`} />
          <Row label="Prepared by" value={personName(a.createdBy)} />
          <Row label="Deadline" value={formatDateTime(a.deadline)} />
          <Row label="Maximum marks" value={String(a.maximumMarks)} />
          <Row label="Resubmission" value={a.allowResubmission ? "Allowed" : "Not allowed"} />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 font-bold text-slate-900 mb-3 text-sm">
          <Zap className="w-4 h-4 text-blue-600" />
          <span>Quick Actions</span>
        </div>
        <div className="divide-y divide-slate-100 text-xs">
          <Link href={`/mentor/assignments/${a.id}`} className={link}>
            <span className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
              View Assignment Details
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600" />
          </Link>
          {editable && (
            <Link href={`/mentor/assignments/${a.id}/edit`} className={link}>
              <span className="flex items-center gap-2">
                <Edit className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                Edit Assignment
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600" />
            </Link>
          )}
          <Link href={`/mentor/courses?scope=${encodeURIComponent(`${a.courseId}:${a.divisionId}`)}&tab=overview`} className={link}>
            <span className="flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
              Course Analytics
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-600" />
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 font-bold text-slate-900 mb-4 text-sm">
          <Info className="w-4 h-4 text-blue-600" />
          <span>How reviews work</span>
        </div>
        <ol className="space-y-2 text-xs text-slate-600 list-decimal pl-4">
          <li>An administrator assigns submitted work to you.</li>
          <li>Start the review, give a score and feedback (and files).</li>
          <li>Submit the review to the administrator — or ask the student for a new attempt.</li>
          <li>The administrator approves (or sends it back) and publishes results to students.</li>
        </ol>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400 block mb-0.5">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
