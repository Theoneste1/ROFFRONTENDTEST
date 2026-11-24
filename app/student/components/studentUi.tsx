/**
 * Presentation helpers shared by the student pages. Colours and shapes come
 * from the original static pages (status badges, course accents).
 */
import type { CourseCode, StudentDisplayStatus } from "@/lib/api/types";

/** Badge colours per backend `displayStatus` (same palette as the original badges). */
const STATUS_BADGE: Record<StudentDisplayStatus, string> = {
  "Not Started": "bg-gray-100 text-gray-600",
  Submitted: "bg-green-100 text-green-600",
  "Pending Review": "bg-orange-100 text-orange-500",
  "Resubmission Requested": "bg-red-100 text-red-500",
  Reviewed: "bg-blue-100 text-blue-600",
};

export const STUDENT_STATUSES = Object.keys(STATUS_BADGE) as StudentDisplayStatus[];

export function StatusBadge({ status, className = "" }: { status: StudentDisplayStatus; className?: string }) {
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"} ${className}`}>
      {status}
    </span>
  );
}

/** Per-course accent (symbol + colours) from the original dashboard cards. */
export const COURSE_STYLE: Record<CourseCode, { symbol: string; chip: string; button: string; banner: string }> = {
  ALGEBRA: {
    symbol: "∑",
    chip: "bg-blue-50 text-blue-600",
    button: "bg-brand-900 hover:bg-brand-800",
    banner: "from-brand-100 via-brand-50 to-white",
  },
  NUMBER_THEORY: {
    symbol: "#",
    chip: "bg-teal-50 text-teal-700",
    button: "bg-brand-800 hover:bg-brand-700",
    banner: "from-brand-100 via-brand-50 to-white",
  },
  COMBINATORICS: {
    symbol: "☍",
    chip: "bg-purple-50 text-purple-600",
    button: "bg-brand-600 hover:bg-brand-700",
    banner: "from-brand-100 via-brand-50 to-white",
  },
  GEOMETRY: {
    symbol: "△",
    chip: "bg-amber-50 text-amber-700",
    button: "bg-brand-700 hover:bg-brand-600",
    banner: "from-brand-100 via-brand-50 to-white",
  },
};

export function courseStyle(code: string) {
  return COURSE_STYLE[code as CourseCode] ?? COURSE_STYLE.ALGEBRA;
}

/** The student's Olympiad level ("Middle level"): divisions are managed by administrators, so no grade range is assumed. */
export function divisionLabel(division: { code: string; name: string } | null | undefined): string {
  if (!division) return "";
  return `${division.name} level`;
}
