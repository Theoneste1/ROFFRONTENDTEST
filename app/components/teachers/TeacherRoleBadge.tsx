/**
 * Primary / Secondary teacher badge (owner decision 2026-11-19: the primary teacher is the school's main contact; the
 * same rights either way). Rules and colours: lib/schools/primary-teacher.ts.
 */
import { TEACHER_ROLE_BADGE, TEACHER_ROLE_HINT, TEACHER_ROLE_LABEL, type TeacherSchoolRole } from "@/lib/schools/primary-teacher";

export default function TeacherRoleBadge({ role, className = "" }: { role: TeacherSchoolRole; className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TEACHER_ROLE_BADGE[role]} ${className}`}
      title={TEACHER_ROLE_HINT[role]}
      data-testid="teacher-role-badge"
      data-role={role}
    >
      {TEACHER_ROLE_LABEL[role]}
    </span>
  );
}
