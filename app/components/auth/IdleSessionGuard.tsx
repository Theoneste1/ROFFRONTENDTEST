'use client';

/**
 * Signs the person out after 60 minutes without activity, with a warning at 55 (owner 2026-11-28). The rules are in
 * lib/auth/idle.ts; this wires them to the page:
 *   - activity: clicks, key presses, the wheel, touch and real mouse movement in this tab (never background requests,
 *     polling, token refreshes or the page scrolling by itself — those make no such events);
 *   - every tab shares one last-activity time (the "storage" event tells this tab about another tab's activity);
 *   - waking up (the tab shown again, the window focused) checks at once: timers do not run while a laptop sleeps;
 *   - the server is told at most once a minute (POST /auth/activity; an older backend's 404 is ignored; a report that
 *     fails is retried);
 *   - at 60 minutes: the session's own secure sign-out (server logout, every tab), and the sign-in page says why.
 * Only for a signed-in person in their own session (never in a "view as" tab, which has its own 30-minute limit).
 */
import { useEffect, useId, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { useSession } from "@/lib/auth/session";
import { authApi } from "@/lib/api/auth";
import { getAccessToken, refreshSession } from "@/lib/api/client";
import { tokenExpiresWithin } from "@/lib/api/refresh-outcome";
import { isApiError } from "@/lib/api/errors";
import { LAST_ACTIVITY_KEY, createIdleTracker, formatCountdown, type IdlePhase, type IdleTracker } from "@/lib/auth/idle";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

/**
 * DOM events that only a person makes. Not "scroll": the page scrolls by itself too (content inserted above the view,
 * layout changes, scrollIntoView), so a polling page would keep an unattended session alive (review 2026-11-28). A
 * person's scrolling still counts through wheel, keys, touch and the scrollbar (pointerdown). Mouse movement counts
 * only when the pointer really moved (browsers also send mousemove after a layout change under a still pointer).
 */
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
/** Report a token refresh before an activity report when the access token ends within this (a lab's tokens expire together). */
const TOKEN_MARGIN_MS = 30_000;

export default function IdleSessionGuard() {
  const session = useSession();
  const active = session.status === "authenticated" && !session.viewAs;
  return active ? <Tracker /> : null;
}

function Tracker() {
  const { logout } = useSession();
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
      // Always sent (review 2026-11-28): gating on the cached capability skipped reports for up to minutes after the
      // backend gained the feature, and the server then ended active sessions. An older backend answers 404: ignored.
      report: async () => {
        try {
          // A lab's tokens expire together: an expired token's report would count against the shared address.
          if (tokenExpiresWithin(getAccessToken(), TOKEN_MARGIN_MS)) await refreshSession();
          await authApi.activity();
          return "ok";
        } catch (e) {
          if (isApiError(e) && (e.status === 404 || e.status === 405)) return "ok";
          // 401 after the client's own refresh attempt: the session has ended — for inactivity, or for another reason
          // (signed out elsewhere, password changed), whose own message must not be replaced by the inactivity one.
          if (isApiError(e) && e.status === 401) return e.code === "SESSION_IDLE_EXPIRED" ? "expired" : "ended";
          return "failed";
        }
      },
      onPhase: (p, left) => { setPhase(p); setMsLeft(left); },
      onExpire: (reason) => { void (reason === "ended" ? logoutRef.current() : logoutRef.current({ reason: "inactive" })); },
    });
    tracker.current = t;

    const onActivity = () => t.activity();
    let lastX = -1;
    let lastY = -1;
    const onMouseMove = (e: MouseEvent) => {
      // Only a real move of the pointer (a still pointer also gets mousemove after layout changes).
      if (e.screenX === lastX && e.screenY === lastY) return;
      const first = lastX === -1;
      lastX = e.screenX;
      lastY = e.screenY;
      if (!first) t.activity();
    };
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { capture: true, passive: true });
    window.addEventListener("mousemove", onMouseMove, { capture: true, passive: true });
    const onStorage = (e: StorageEvent) => { if (e.key === LAST_ACTIVITY_KEY || e.key === null) t.check(); };
    const onWake = () => t.check();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity, { capture: true });
      window.removeEventListener("mousemove", onMouseMove, { capture: true });
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
