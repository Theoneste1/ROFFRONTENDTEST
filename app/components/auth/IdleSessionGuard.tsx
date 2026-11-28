'use client';

/**
 * Signs the person out after 60 minutes without activity, with a warning at 55 (owner 2026-11-28). The rules are in
 * lib/auth/idle.ts; this wires them to the page:
 *   - activity: clicks, key presses, scrolling, the wheel, touch and mouse movement in this tab (never background
 *     requests, polling or token refreshes — those make no DOM events);
 *   - every tab shares one last-activity time (the "storage" event tells this tab about another tab's activity);
 *   - waking up (the tab shown again, the window focused) checks at once: timers do not run while a laptop sleeps;
 *   - the server is told at most once a minute (POST /auth/activity, when the backend has sessionIdleTimeout);
 *   - at 60 minutes: the session's own secure sign-out (server logout, every tab), and the sign-in page says why.
 * Only for a signed-in person in their own session (never in a "view as" tab, which has its own 30-minute limit).
 */
import { useEffect, useId, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { useBackendCapabilities } from "@/lib/queries/capabilities";
import { hasFeature } from "@/lib/api/capabilities";
import { authApi } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/errors";
import { LAST_ACTIVITY_KEY, createIdleTracker, formatCountdown, type IdlePhase, type IdleTracker } from "@/lib/auth/idle";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

/** DOM events that are the person doing something. Mouse movement is included (owner); it is cheap: one timestamp. */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"] as const;

export default function IdleSessionGuard() {
  const session = useSession();
  const active = session.status === "authenticated" && !session.viewAs;
  return active ? <Tracker /> : null;
}

function Tracker() {
  const { logout } = useSession();
  const { detection } = useBackendCapabilities();
  const reports = hasFeature(detection, "sessionIdleTimeout");
  const reportsRef = useRef(reports);
  useEffect(() => { reportsRef.current = reports; }, [reports]);
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  const [phase, setPhase] = useState<IdlePhase>("active");
  const [msLeft, setMsLeft] = useState(0);
  const tracker = useRef<IdleTracker | null>(null);

  useEffect(() => {
    let store: Storage | null = null;
    try { store = window.localStorage; } catch { store = null; }
    const t = createIdleTracker({
      now: () => Date.now(),
      store,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      report: async () => {
        if (!reportsRef.current) return "ok";
        try {
          await authApi.activity();
          return "ok";
        } catch (e) {
          // 401 after the client's own refresh attempt: the server has ended this session.
          return isApiError(e) && e.status === 401 ? "expired" : "failed";
        }
      },
      onPhase: (p, left) => { setPhase(p); setMsLeft(left); },
      onExpire: () => { void logoutRef.current({ reason: "inactive" }); },
    });
    tracker.current = t;

    const onActivity = () => t.activity();
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { capture: true, passive: true });
    const onStorage = (e: StorageEvent) => { if (e.key === LAST_ACTIVITY_KEY || e.key === null) t.check(); };
    const onWake = () => t.check();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity, { capture: true });
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      t.dispose();
      tracker.current = null;
    };
  }, []);

  if (phase !== "warning") return null;
  return (
    <IdleWarning
      msLeft={msLeft}
      onContinue={() => tracker.current?.activity({ explicit: true })}
      onSignOut={() => void logout()}
    />
  );
}

function IdleWarning({ msLeft, onContinue, onSignOut }: { msLeft: number; onContinue: () => void; onSignOut: () => void }) {
  const titleId = useId();
  const textId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onContinue(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onContinue]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-brand-950/50 p-4" data-testid="idle-warning">
      <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={textId}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-amber-100 text-amber-700"><Clock className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-slate-900">Are you still there?</h2>
            <p id={textId} className="mt-1 text-sm leading-6 text-slate-700" data-testid="idle-warning-text">
              Your session will expire in 5 minutes due to inactivity. Would you like to continue working?
            </p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-amber-800" aria-live="polite" data-testid="idle-warning-countdown">
              Signing out in {formatCountdown(msLeft)}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onSignOut} data-testid="idle-sign-out"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
            Sign out now
          </button>
          <button type="button" onClick={onContinue} data-autofocus data-testid="idle-continue"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2">
            Continue working
          </button>
        </div>
      </div>
    </div>
  );
}
