/** Academic years: pure rules for the admin page (validation mirrors the backend DTOs). */
import type { AcademicYear, ActivationResult } from "../api/academic-years";

export const YEAR_RULES = { nameMin: 4, nameMax: 30, datePattern: /^\d{4}-\d{2}-\d{2}$/ };

export interface YearForm {
  name: string;
  startsOn: string;
  endsOn: string;
}

export function validateYearForm(f: YearForm): Partial<Record<keyof YearForm, string>> {
  const e: Partial<Record<keyof YearForm, string>> = {};
  const n = f.name.trim();
  if (n.length < YEAR_RULES.nameMin || n.length > YEAR_RULES.nameMax) e.name = "4–30 characters, e.g. 2027-2028.";
  if (!YEAR_RULES.datePattern.test(f.startsOn)) e.startsOn = "Choose the first day.";
  if (!YEAR_RULES.datePattern.test(f.endsOn)) e.endsOn = "Choose the last day.";
  if (!e.startsOn && !e.endsOn && f.endsOn <= f.startsOn) e.endsOn = "The last day must be after the first day.";
  return e;
}

/** `YYYY-MM-DD` from the backend's date-only value, without a time-zone shift. */
export const dayOf = (iso: string) => iso.slice(0, 10);

/** "1 Sep 2026" from a date-only value, formatted in UTC so it never moves a day. */
export function formatDay(iso: string): string {
  const d = new Date(`${dayOf(iso)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const currentYear = (years: readonly AcademicYear[]) => years.find((y) => y.isCurrent === true || y.status === "ACTIVE") ?? null;

/** Only what changed (the backend's PATCH takes optional name / startsOn / endsOn). */
export function yearChanges(before: AcademicYear, f: YearForm): Partial<YearForm> {
  const out: Partial<YearForm> = {};
  if (f.name.trim() !== before.name) out.name = f.name.trim();
  if (f.startsOn !== dayOf(before.startsOn)) out.startsOn = f.startsOn;
  if (f.endsOn !== dayOf(before.endsOn)) out.endsOn = f.endsOn;
  return out;
}

/** The activation outcome in plain words (counts returned by the backend). */
export function activationSummary(r: ActivationResult): string[] {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const lines = [`${r.academicYear.name} is now the current academic year.`];
  if (r.promoted) lines.push(`${n(r.promoted, "student was", "students were")} moved up one grade.`);
  if (r.carriedOver) lines.push(`${n(r.carriedOver, "student continues", "students continue")} in the same grade.`);
  if (r.graduated) lines.push(`${n(r.graduated, "S6 student graduated", "S6 students graduated")}.`);
  if (r.newlyEnrolled) lines.push(`${n(r.newlyEnrolled, "student without an enrolment was", "students without an enrolment were")} enrolled.`);
  if (r.assignmentsArchived) lines.push(`${n(r.assignmentsArchived, "assignment", "assignments")} of the previous year archived.`);
  return lines;
}

/** Backend refusals in plain words. */
export const YEAR_ERRORS: Readonly<Record<string, string>> = {
  INVALID_DATE_RANGE: "The last day must be after the first day.",
  INVALID_STATE_TRANSITION: "This change isn't possible in the year's current state (closed years can't be edited; only planned years can be started; only current-year enrolments can be changed). The list has been refreshed.",
  DUPLICATE: "An academic year with this name already exists.",
  NO_CHANGES: "Nothing to change.",
};
