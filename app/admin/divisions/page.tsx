"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { DIVISION_RULES } from "@/lib/api/admin";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import type { AdminDivision } from "@/lib/api/types";
import { useActiveScopes, useAdminDivisions, useUpdateDivision } from "@/lib/queries/admin";
import { useCourses } from "@/lib/queries/learning";
import { formatNumber } from "@/lib/format";
import { Alert, ErrorState, LoadingBlock, Spinner } from "@/app/components/ui/feedback";

/**
 * The two fixed divisions (`GET /admin/divisions`). Name and description can
 * be edited (`PATCH /admin/divisions/:id`). Divisions cannot be created or
 * deleted. The backend's `isActive` flag has no effect anywhere, so it is shown
 * but not offered as a switch; "accepting new students" has no backend field.
 */
function DivisionCard({ division, courses, mentors }: { division: AdminDivision; courses: string[]; mentors: number | undefined }) {
  const update = useUpdateDivision();
  const [name, setName] = useState(division.name);
  const [description, setDescription] = useState(division.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const grades = `${division.gradeLevels[0]}–${division.gradeLevels[division.gradeLevels.length - 1]}`;
  const server = fieldErrors(update.error, ["name", "description"]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const n = name.trim();
    if (n.length < DIVISION_RULES.name.min || n.length > DIVISION_RULES.name.max) return setError("The name must be 2–100 characters.");
    if (description.length > DIVISION_RULES.description.max) return setError("The description can be at most 1,000 characters.");
    const input: { name?: string; description?: string } = {};
    if (n !== division.name) input.name = n;
    if (description.trim() !== (division.description ?? "")) input.description = description.trim();
    if (!Object.keys(input).length) return setError("Nothing has changed.");
    setError(null);
    try {
      await update.mutateAsync({ id: division.id, input });
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={save} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100/80 flex flex-col justify-between">
      <div>
        {/* Title & Subtitle */}
        <h2 className="text-lg font-bold text-gray-900">{division.name}</h2>
        <p className="text-xs text-gray-400 mt-0.5 font-medium mb-6">
          {grades} · {formatNumber(division._count.students)} students · {mentors === undefined ? "…" : formatNumber(mentors)} mentor{mentors === 1 ? "" : "s"}
          {!division.isActive && <span className="ml-2 text-amber-600 font-semibold">Marked inactive</span>}
        </p>

        {/* Courses Section */}
        <div className="mb-6">
          <span className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Available mathematics courses</span>
          <div className="flex flex-wrap gap-2">
            {courses.map((course) => (
              <span key={course} className="px-3 py-1 bg-indigo-50/70 text-indigo-700 text-xs font-semibold rounded-full">
                {course}
              </span>
            ))}
          </div>
        </div>

        {/* Action Links */}
        <div className="mb-6 border-b border-gray-100 pb-6 flex flex-wrap gap-2">
          <Link href={`/admin/students?divisionId=${division.id}`} className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl transition-colors shadow-2xs">
            View students
          </Link>
          <Link href={`/admin/mentors?divisionId=${division.id}`} className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-xl transition-colors shadow-2xs">
            View mentors
          </Link>
        </div>

        <div className="mb-4">
          <label htmlFor={`name-${division.id}`} className="block text-xs font-semibold text-gray-700 mb-2">
            Division name
          </label>
          <input
            id={`name-${division.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DIVISION_RULES.name.max}
            className="w-full text-xs text-gray-800 bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
          />
          {server.name && <p className="mt-1 text-[11px] text-red-600">{server.name}</p>}
        </div>

        {/* Description Textarea */}
        <div className="mb-6">
          <label htmlFor={`desc-${division.id}`} className="block text-xs font-semibold text-gray-700 mb-2">
            Division description
          </label>
          <textarea
            id={`desc-${division.id}`}
            rows={3}
            value={description}
            maxLength={DIVISION_RULES.description.max}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full text-xs text-gray-800 bg-white border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium"
          />
          {server.description && <p className="mt-1 text-[11px] text-red-600">{server.description}</p>}
        </div>
        {error && (
          <div className="mb-4">
            <Alert tone={error === "Nothing has changed." ? "info" : "error"}>{error}</Alert>
          </div>
        )}
        {saved && (
          <div className="mb-4">
            <Alert tone="success">Division saved.</Alert>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div>
        <button type="submit" disabled={update.isPending} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs disabled:opacity-50">
          {update.isPending && <Spinner className="h-3.5 w-3.5 !text-white" />}
          Save settings
        </button>
      </div>
    </form>
  );
}

export default function DivisionsContent() {
  const divisions = useAdminDivisions();
  const courses = useCourses();
  const scopes = useActiveScopes();
  const mentorsIn = (divisionId: string) => (scopes.data ? new Set(scopes.data.filter((s) => s.division.id === divisionId).map((s) => s.mentor.id)).size : undefined);

  return (
    <div className="min-h-screen bg-[#E6EBF2] p-4 sm:p-6 md:p-10 text-gray-800 font-sans">
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Divisions</h1>
        <p className="text-sm text-gray-500 mt-1 font-medium">The ROF LMS has exactly two divisions: Junior (S1–S3) and Senior (S4–S6).</p>
      </div>

      {divisions.isPending ? (
        <LoadingBlock />
      ) : divisions.isError ? (
        <ErrorState error={divisions.error} title="Couldn't load divisions" onRetry={() => divisions.refetch()} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {divisions.data.map((d) => (
            <DivisionCard key={d.id} division={d} courses={(courses.data ?? []).map((c) => c.title)} mentors={mentorsIn(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
