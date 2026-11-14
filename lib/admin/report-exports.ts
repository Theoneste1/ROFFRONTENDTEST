/**
 * Which filters each Reports CSV export receives. The page's filters (course, division, period)
 * are sent to every export that applies them. When an export cannot apply what is selected, the
 * button is disabled with the reason — a selected filter is never dropped silently.
 *
 * - `results.csv` needs a course AND a division (one row per submission of that course × division;
 *   backend FILTER_REQUIRED otherwise). With the backend feature `reportExportFilters` it also applies
 *   the period (submitted between); older backends refuse the period.
 * - `enrollment.csv` applies a course only with `reportExportFilters` (older backends refuse it).
 * - Exports marked `noFilters` (coach workload) take none; the page says so.
 */
import type { ReportFilters } from "@/lib/api/types";

export type ExportQuery = { courseId?: string; divisionId?: string; from?: string };
export type ExportPlan = { query: ExportQuery; disabledReason?: undefined; note?: string } | { query?: undefined; disabledReason: string; note?: undefined };

export function exportPlan(
  x: { key: string; noFilters?: boolean },
  filters: Pick<ReportFilters, "courseId" | "divisionId" | "from">,
  serverFilters: boolean,
): ExportPlan {
  const query: ExportQuery = {
    ...(filters.courseId && { courseId: filters.courseId }),
    ...(filters.divisionId && { divisionId: filters.divisionId }),
    ...(filters.from && { from: filters.from }),
  };
  if (x.noFilters) {
    const any = Object.keys(query).length > 0;
    return { query: {}, ...(any && { note: "All courses, divisions and dates" }) };
  }
  if (x.key === "results") {
    if (!filters.courseId || !filters.divisionId) return { disabledReason: "Choose a course and a division to export results." };
    if (filters.from && !serverFilters) return { disabledReason: "This server can't limit results by period. Choose “All time”." };
    return { query };
  }
  if (x.key === "enrollment" && filters.courseId && !serverFilters) {
    return { disabledReason: "This server can't filter enrolment by course. Choose “All courses”." };
  }
  return { query };
}
