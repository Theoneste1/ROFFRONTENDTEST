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
  NOT_FOUND: "This academic year or enrolment no longer exists. The list has been refreshed.",
  INVALID_STATE_TRANSITION: "This change isn't possible in the year's current state (closed years can't be edited; only planned years can be started; only current-year enrolments can be changed). The list has been refreshed.",
  DUPLICATE: "An academic year with this name already exists.",
  NO_CHANGES: "Nothing to change.",
};

// ─── Starting a year: the uncertain-outcome lock ────────────────────────────
//
// Starting a year is ONE request whose backend transaction may run up to 120 s
// (academic-years.service.ts: `$transaction(…, { timeout: 120_000 })`), while the
// Netlify proxy gives up after ~26 s and Next's local proxy after 30 s. A lost
// response therefore says nothing about the outcome: the backend may still be
// working, and a second request would queue behind the first and run again.
//
// So, before sending, the page records a lock (browser storage: it survives
// closing the dialog and reloading the page). While the lock is held no year can
// be started. It ends when:
//   - the backend answers 2xx (done) or with a definite refusal (4xx: it refused
//     before starting the transaction), or
//   - the list shows the year ACTIVE (it was started), or
//   - the window has passed (the transaction has committed or rolled back) and
//     the list still shows it PLANNED — then a new attempt is very likely safe.
// Limits (frontend-only protection; see INTEGRATION_PROGRESS.md "Known
// limitations"):
//   - The lock is per browser. Another administrator, browser or device is not
//     protected.
//   - The window is an estimate, not a guarantee: it starts when the browser
//     sends, but the backend's 120 s only start when its transaction opens. A
//     sleeping Render instance or a slow network can delay that by an unknown
//     amount.
// Only an idempotent / single-flight activation in the backend can make a retry
// safe.

/**
 * 120 s backend transaction timeout + up to ~3 min for the request to reach the
 * backend (Render cold start, queueing) and the pre-transaction reads.
 */
export const ACTIVATION_LOCK_MS = 300_000;
export const ACTIVATION_LOCK_KEY = "rof.academicYearActivation";

export interface ActivationLock {
  yearId: string;
  yearName: string;
  startedAt: number;
}

export interface LockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * In-memory fallback when browser storage is unavailable (private mode, blocked).
 * It survives closing the dialog but NOT a page reload.
 */
const memory = new Map<string, string>();
const memoryStorage: LockStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

let chosen: LockStorage | null = null;
/** Browser storage if it works (probed once per page load), else the in-memory fallback. */
export function lockStorage(): LockStorage {
  if (chosen) return chosen;
  try {
    const s = window.localStorage;
    const probe = `${ACTIVATION_LOCK_KEY}.probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    chosen = s;
  } catch {
    chosen = memoryStorage;
  }
  return chosen;
}

export function readActivationLock(storage: LockStorage): ActivationLock | null {
  try {
    const raw = storage.getItem(ACTIVATION_LOCK_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ActivationLock>;
    return typeof v.yearId === "string" && typeof v.yearName === "string" && typeof v.startedAt === "number" ? (v as ActivationLock) : null;
  } catch {
    return null;
  }
}

export function writeActivationLock(storage: LockStorage, lock: ActivationLock): void {
  try {
    storage.setItem(ACTIVATION_LOCK_KEY, JSON.stringify(lock));
  } catch {
    memoryStorage.setItem(ACTIVATION_LOCK_KEY, JSON.stringify(lock));
  }
}

export function clearActivationLock(storage: LockStorage): void {
  try {
    storage.removeItem(ACTIVATION_LOCK_KEY);
  } catch {
    /* nothing to clear */
  }
  memoryStorage.removeItem(ACTIVATION_LOCK_KEY);
}

export type LockState =
  | { kind: "none" }
  /** The backend may still be working: starting stays locked until `until`. */
  | { kind: "waiting"; lock: ActivationLock; until: number }
  /** The list shows the locked year as current: it was started. */
  | { kind: "succeeded"; lock: ActivationLock }
  /** The window has passed and the year is still not current: a new attempt is safe. */
  | { kind: "expired"; lock: ActivationLock };

/**
 * `years` must come from a list fetched after the lock was taken (`fetchedAt`);
 * an older list can't show the outcome. Before the window ends only "succeeded"
 * can end the lock early — a list still showing PLANNED proves nothing then.
 */
export function activationLockState(lock: ActivationLock | null, years: readonly AcademicYear[] | undefined, fetchedAt: number, now: number): LockState {
  if (!lock) return { kind: "none" };
  const until = lock.startedAt + ACTIVATION_LOCK_MS;
  const fresh = years !== undefined && fetchedAt > lock.startedAt;
  const year = fresh ? years.find((y) => y.id === lock.yearId) : undefined;
  if (year && (year.status === "ACTIVE" || year.isCurrent === true)) return { kind: "succeeded", lock };
  if (now < until) return { kind: "waiting", lock, until };
  // After the window: the outcome needs a list fetched after the window ended.
  if (years !== undefined && fetchedAt >= until) return { kind: "expired", lock };
  return { kind: "waiting", lock, until };
}

/**
 * After a failed start request: was it a definite refusal (the backend answered
 * 4xx before starting the transaction — safe to retry at once), or is the
 * outcome unknown (no response, proxy timeout, 5xx)?
 */
export function activationOutcomeUnknown(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return !(typeof status === "number" && status >= 400 && status < 500 && status !== 408);
}
