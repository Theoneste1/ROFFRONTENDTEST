/**
 * Signing out after 60 minutes without activity (owner 2026-11-28) — the rules, free of React and of the browser so
 * they are unit-tested with fake timers (tests/idle.test.mjs). The component that wires them to the page is
 * app/components/auth/IdleSessionGuard.tsx.
 *
 * - Activity is what the person does: clicks, typing, scrolling, mouse movement, touch. Background requests, polling
 *   and token refreshes never call `activity()`, so they never keep a session alive.
 * - Every tab of the browser shares one "last activity" time (localStorage). Activity in any tab keeps every tab
 *   signed in; a tab never signs out while another one is in use.
 * - At 55 minutes the warning shows; at 60 minutes the session ends (the caller signs out securely: server logout,
 *   every tab). While the warning shows, only an explicit "continue" (or activity in another tab) counts — a mouse
 *   passing over the page does not silently dismiss it.
 * - The server is told about activity (POST /auth/activity) at most once a minute, with a trailing report so the last
 *   activity of a burst is never lost; the server ends the session on its own too (its limit adds 2 minutes for
 *   reports in transit), and a report answered "expired" ends the session here at once.
 */
export const IDLE_TIMEOUT_MS = 60 * 60_000;
export const IDLE_WARNING_MS = 55 * 60_000;
export const ACTIVITY_REPORT_INTERVAL_MS = 60_000;
/** localStorage key holding the last activity time (ms since epoch) shared by the tabs. */
export const LAST_ACTIVITY_KEY = "rof-last-activity";
/** Local activity is written to the shared time at most this often (a mouse move fires many events). */
const SHARE_INTERVAL_MS = 1_000;

export type IdlePhase = "active" | "warning" | "expired";

export function idlePhase(lastActivity: number, now: number): IdlePhase {
  const idle = now - lastActivity;
  return idle >= IDLE_TIMEOUT_MS ? "expired" : idle >= IDLE_WARNING_MS ? "warning" : "active";
}

/** Milliseconds until the session ends (never negative). */
export function msUntilSignOut(lastActivity: number, now: number): number {
  return Math.max(0, lastActivity + IDLE_TIMEOUT_MS - now);
}

/** "4:59", "0:07": the countdown shown in the warning. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The shared last activity, or null when unset or unreadable. */
export function readLastActivity(store: KeyValueStore | null): number | null {
  try {
    const raw = store?.getItem(LAST_ACTIVITY_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Moves the shared last activity forward (never back: another tab may have written a later time). */
export function shareLastActivity(store: KeyValueStore | null, at: number, { reset = false } = {}): void {
  try {
    const current = readLastActivity(store);
    if (reset || current === null || at > current) store?.setItem(LAST_ACTIVITY_KEY, String(at));
  } catch {
    // Storage unavailable: this tab keeps its own time; the others keep theirs.
  }
}

/**
 * ok: the server knows (or does not track activity — an older backend answers 404); expired: the server ended the
 * session for inactivity; ended: the server refused for another reason (signed out elsewhere, password changed);
 * failed: not delivered (network, 429, 5xx) — retried, so the server never lags behind the browser.
 */
export type ReportResult = "ok" | "expired" | "ended" | "failed";
/** A report that could not be delivered is tried again after this long. */
export const REPORT_RETRY_MS = 15_000;

export interface IdleTrackerDeps {
  now(): number;
  store: KeyValueStore | null;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Tell the server about activity (POST /auth/activity); "expired" when the server ended the session. */
  report(): Promise<ReportResult>;
  /** The phase or the time left changed (for the warning dialog). */
  onPhase(phase: IdlePhase, msLeft: number): void;
  /** The session must end now (called once): idle (60 minutes here), server (the server ended it for inactivity), ended (another reason). */
  onExpire(reason: "idle" | "server" | "ended"): void;
}

export interface IdleTracker {
  /** Something the person did in this tab. `explicit`: the warning's "continue" (counts even while it shows). */
  activity(opts?: { explicit?: boolean }): void;
  /** Re-read the shared time and act on it (another tab's activity, waking from sleep, a timer). */
  check(): void;
  /** The last activity this tab knows (shared or its own). */
  lastActivity(): number;
  dispose(): void;
}

/**
 * The tracker of one tab. `startedAt` is when the session started in this browser (the shared time is used when it is
 * later, e.g. another tab was active; an older shared time from a previous session is replaced by `fresh`).
 */
export function createIdleTracker(deps: IdleTrackerDeps, { fresh = false }: { fresh?: boolean } = {}): IdleTracker {
  let local = deps.now();
  if (fresh) shareLastActivity(deps.store, local, { reset: true });
  else {
    const shared = readLastActivity(deps.store);
    if (shared === null) shareLastActivity(deps.store, local, { reset: true });
    else local = shared;   // the browser's last activity (it may already be past the limit: then the session ends now)
  }
  let lastShared = 0;
  let lastReport = 0;
  let pendingReport: unknown = null;
  let timer: unknown = null;
  let phase: IdlePhase = "active";
  let ended = false;

  const last = () => Math.max(local, readLastActivity(deps.store) ?? 0);

  const end = (reason: "idle" | "server" | "ended") => {
    if (ended) return;
    ended = true;
    if (timer !== null) deps.clearTimer(timer);
    if (pendingReport !== null) deps.clearTimer(pendingReport);
    timer = pendingReport = null;
    phase = "expired";
    deps.onPhase("expired", 0);
    deps.onExpire(reason);
  };

  const schedule = () => {
    if (ended) return;
    if (timer !== null) deps.clearTimer(timer);
    const now = deps.now();
    const at = last();
    // Next moment anything changes: the warning, the end, or each second of the countdown while it shows.
    const untilWarning = at + IDLE_WARNING_MS - now;
    const delay = untilWarning > 0 ? untilWarning : Math.min(1_000, msUntilSignOut(at, now));
    timer = deps.setTimer(check, Math.max(0, delay));
  };

  function check() {
    if (ended) return;
    timer = null;
    const now = deps.now();
    const at = last();
    const next = idlePhase(at, now);
    if (next === "expired") return end("idle");
    if (next !== phase || next === "warning") deps.onPhase(next, msUntilSignOut(at, now));
    phase = next;
    schedule();
  }

  const sendReport = () => {
    pendingReport = null;
    if (ended) return;
    lastReport = deps.now();
    const retry = () => {
      // Not delivered: the next activity reports at once, and the last one is tried again shortly (never dropped).
      lastReport = 0;
      if (!ended && pendingReport === null) pendingReport = deps.setTimer(sendReport, REPORT_RETRY_MS);
    };
    void deps.report().then((r) => {
      if (r === "expired") end("server");
      else if (r === "ended") end("ended");
      else if (r === "failed") retry();
    }, retry);
  };

  function activity({ explicit = false }: { explicit?: boolean } = {}) {
    if (ended) return;
    // The warning is a question: only its answer (or activity in another tab) dismisses it.
    if (phase === "warning" && !explicit) return;
    const now = deps.now();
    if (idlePhase(last(), now) === "expired") return end("idle");
    local = now;
    if (explicit || now - lastShared >= SHARE_INTERVAL_MS) {
      lastShared = now;
      shareLastActivity(deps.store, now);
    }
    // At most one report a minute: now if the last one is a minute old, else once the minute is over (trailing).
    if (now - lastReport >= ACTIVITY_REPORT_INTERVAL_MS || explicit) {
      if (pendingReport !== null) { deps.clearTimer(pendingReport); pendingReport = null; }
      sendReport();
    } else if (pendingReport === null) {
      pendingReport = deps.setTimer(sendReport, lastReport + ACTIVITY_REPORT_INTERVAL_MS - now);
    }
    if (phase !== "active") {
      phase = "active";
      deps.onPhase("active", msUntilSignOut(now, now));
    }
    schedule();
  }

  schedule();
  // A browser whose last activity is already past the limit (e.g. reopened after hours): end at once.
  if (idlePhase(last(), deps.now()) === "expired") end("idle");

  return {
    activity,
    check,
    lastActivity: last,
    dispose() {
      ended = true;
      if (timer !== null) deps.clearTimer(timer);
      if (pendingReport !== null) deps.clearTimer(pendingReport);
      timer = pendingReport = null;
    },
  };
}
