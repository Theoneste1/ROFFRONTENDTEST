"use client";

/**
 * Admin Users list: a Coach's subjects under the role ("Mathematics, Physics", or "Not set"), on a backend advertising
 * coachOlympiadInterests. Nothing for other roles.
 */
import { coachInterestsSupported, coachSubjectsText } from "@/lib/accounts/coach-application";
import { useBackendCapabilities } from "@/lib/queries/capabilities";

export default function CoachSubjectsNote({ role, subjects, other }: { role: string; subjects: readonly string[] | null | undefined; other?: string | null }) {
  const { detection } = useBackendCapabilities();
  if (role !== "MENTOR" || !coachInterestsSupported(detection)) return null;
  return (
    <span className="block text-xs font-normal text-gray-600" data-testid="coach-subjects-note">
      Subjects: {coachSubjectsText(subjects, other)}
    </span>
  );
}
