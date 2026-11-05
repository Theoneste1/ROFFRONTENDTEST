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
    button: "bg-[#03045e] hover:bg-[#0b1784]",
    banner: "from-blue-300 via-blue-400 to-indigo-300",
  },
  NUMBER_THEORY: {
    symbol: "#",
    chip: "bg-teal-50 text-teal-700",
    button: "bg-[#003B46] hover:bg-[#005662]",
    banner: "from-teal-300 via-cyan-400 to-blue-300",
  },
  COMBINATORICS: {
    symbol: "☍",
    chip: "bg-purple-50 text-purple-600",
    button: "bg-[#6c2bd9] hover:bg-[#5b21b6]",
    banner: "from-purple-300 via-indigo-400 to-blue-300",
  },
  GEOMETRY: {
    symbol: "△",
    chip: "bg-red-50 text-red-600",
    button: "bg-red-600 hover:bg-red-700",
    banner: "from-rose-300 via-red-300 to-orange-200",
  },
};

export function courseStyle(code: string) {
  return COURSE_STYLE[code as CourseCode] ?? COURSE_STYLE.ALGEBRA;
}

/** Junior (S1–S3) / Senior (S4–S6). */
export function divisionLabel(division: { code: string; name: string } | null | undefined): string {
  if (!division) return "";
  return division.code === "JUNIOR" ? `${division.name} division · S1–S3` : division.code === "SENIOR" ? `${division.name} division · S4–S6` : division.name;
}
