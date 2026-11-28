// Signing out after 60 minutes without activity (owner 2026-11-28; lib/auth/idle.ts): the rules with a fake clock —
// warning at 55, sign-out at 60, activity resets, background work does not, every tab shares one time, the server is
// told at most once a minute (with a trailing report) and its "expired" ends the session.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_REPORT_INTERVAL_MS, IDLE_TIMEOUT_MS, IDLE_WARNING_MS, LAST_ACTIVITY_KEY, createIdleTracker, formatCountdown, idlePhase,
} from "@/lib/auth/idle";

const MIN = 60_000;

/** A fake clock with timers, a shared store (one per "browser") and recorded callbacks. */
function world(start = 1_800_000_000_000) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  const store = new Map();
  const browserStore = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
    }
    now = end;
  };
  const tab = ({ fresh = false, reportResult = "ok" } = {}) => {
    const t = { phases: [], expired: [], reports: 0, reportResult };
    t.tracker = createIdleTracker({
      now: () => now,
      store: browserStore,
      setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
      clearTimer: (id) => timers.delete(id),
      report: async () => { t.reports++; return t.reportResult; },
      onPhase: (p, left) => t.phases.push([p, left]),
      onExpire: (reason) => t.expired.push(reason),
    }, { fresh });
    return t;
  };
  return { tab, advance, store, now: () => now, set: (ms) => { now = ms; } };
}

const flush = () => new Promise((r) => setImmediate(r));

test("the phases: active before 55 minutes, warning from 55, expired at exactly 60", () => {
  assert.equal(idlePhase(0, IDLE_WARNING_MS - 1), "active");
  assert.equal(idlePhase(0, IDLE_WARNING_MS), "warning");
  assert.equal(idlePhase(0, IDLE_TIMEOUT_MS - 1), "warning");
  assert.equal(idlePhase(0, IDLE_TIMEOUT_MS), "expired");
  assert.equal(formatCountdown(5 * MIN), "5:00");
  assert.equal(formatCountdown(299_001), "5:00");
  assert.equal(formatCountdown(7_000), "0:07");
});

test("no activity: the warning at 55 minutes, then the sign-out at exactly 60 — once", () => {
  const w = world();
  const t = w.tab({ fresh: true });
  w.advance(IDLE_WARNING_MS - 1);
  assert.deepEqual(t.phases, []);
  w.advance(1);
  assert.deepEqual(t.phases.at(-1), ["warning", 5 * MIN]);
  w.advance(5 * MIN - 1);
  assert.deepEqual(t.expired, []);
  w.advance(1);
  assert.deepEqual(t.expired, ["idle"]);
  w.advance(10 * MIN);
  assert.deepEqual(t.expired, ["idle"], "ended once");
});

test("activity resets the clock; background work (no activity call) does not", () => {
  const w = world();
  const t = w.tab({ fresh: true });
  w.advance(50 * MIN);
  t.tracker.activity();
  w.advance(59 * MIN);              // 59 minutes after the activity: still signed in (background requests happened meanwhile)
  assert.deepEqual(t.expired, []);
  w.advance(1 * MIN);
  assert.deepEqual(t.expired, ["idle"]);
});

test("while the warning shows, a passing mouse does not dismiss it; Continue does, and resets to a full 60 minutes", () => {
  const w = world();
  const t = w.tab({ fresh: true });
  w.advance(56 * MIN);
  assert.equal(t.phases.at(-1)[0], "warning");
  t.tracker.activity();                         // mouse movement over the page
  assert.equal(t.phases.at(-1)[0], "warning");
  t.tracker.activity({ explicit: true });       // "Continue working"
  assert.deepEqual(t.phases.at(-1), ["active", 60 * MIN]);
  w.advance(59 * MIN);
  assert.deepEqual(t.expired, []);
  w.advance(1 * MIN);
  assert.deepEqual(t.expired, ["idle"]);
});

test("tabs share one time: activity in tab B keeps tab A signed in and dismisses A's warning", () => {
  const w = world();
  const a = w.tab({ fresh: true });
  const b = w.tab();
  w.advance(56 * MIN);
  assert.equal(a.phases.at(-1)[0], "warning");
  b.tracker.activity({ explicit: true });      // the person works in tab B
  a.tracker.check();                           // tab A hears it (storage event)
  assert.equal(a.phases.at(-1)[0], "active");
  w.advance(30 * MIN);
  b.tracker.activity();
  w.advance(45 * MIN);                         // 75 minutes after A's last own activity, 45 after B's
  assert.deepEqual(a.expired, [], "A is not signed out while B is in use");
  w.advance(15 * MIN);
  assert.deepEqual(a.expired, ["idle"]);
  assert.deepEqual(b.expired, ["idle"]);
});

test("the shared time only moves forward; a new sign-in starts a new clock", () => {
  const w = world();
  w.store.set(LAST_ACTIVITY_KEY, String(w.now() - 2 * 60 * MIN));   // a session long ago in this browser
  const t = w.tab({ fresh: true });
  assert.equal(Number(w.store.get(LAST_ACTIVITY_KEY)), w.now());
  assert.deepEqual(t.expired, []);
  w.advance(10 * MIN);
  t.tracker.activity();
  const later = Number(w.store.get(LAST_ACTIVITY_KEY));
  w.store.set(LAST_ACTIVITY_KEY, String(later + 5 * MIN));         // another tab wrote a later time
  t.tracker.activity();                                            // this tab's older time must not overwrite it
  assert.equal(Number(w.store.get(LAST_ACTIVITY_KEY)), later + 5 * MIN);
});

test("a browser reopened after more than 60 minutes ends the session at once", () => {
  const w = world();
  w.store.set(LAST_ACTIVITY_KEY, String(w.now() - 61 * MIN));
  const t = w.tab();
  assert.deepEqual(t.expired, ["idle"]);
});

test("the server is told at most once a minute, with a trailing report for the end of a burst", async () => {
  const w = world();
  const t = w.tab({ fresh: true });
  t.tracker.activity();
  assert.equal(t.reports, 1, "the first activity is reported at once");
  for (let i = 0; i < 30; i++) { w.advance(1_000); t.tracker.activity(); }
  assert.equal(t.reports, 1, "a burst within the minute is not reported again yet");
  w.advance(ACTIVITY_REPORT_INTERVAL_MS);
  assert.equal(t.reports, 2, "the trailing report carries the burst's last activity");
  w.advance(10 * MIN);
  assert.equal(t.reports, 2, "no activity, no report (background work never reports)");
  t.tracker.activity({ explicit: true });
  assert.equal(t.reports, 3, "Continue is reported at once");
  await flush();
});

test("the server says the session ended: this tab ends it at once", async () => {
  const w = world();
  const t = w.tab({ fresh: true, reportResult: "expired" });
  t.tracker.activity();
  await flush();
  assert.deepEqual(t.expired, ["server"]);
});

test("after the end nothing restarts it: activity, checks and timers do nothing", () => {
  const w = world();
  const t = w.tab({ fresh: true });
  w.advance(60 * MIN);
  t.tracker.activity({ explicit: true });
  t.tracker.check();
  w.advance(60 * MIN);
  assert.deepEqual(t.expired, ["idle"]);
});

test("waking from sleep (timers late): the next check ends a session idle past 60 minutes", () => {
  const w = world();
  const t = w.tab({ fresh: true });
  w.set(w.now() + 3 * 60 * MIN);    // the laptop slept for 3 hours; no timer ran
  t.tracker.check();                 // visibilitychange / focus
  assert.deepEqual(t.expired, ["idle"]);
});

test("review 2026-11-28: a report that fails is retried (never dropped), and the next activity reports at once", async () => {
  const w = world();
  const t = w.tab({ fresh: true, reportResult: "failed" });
  t.tracker.activity();
  assert.equal(t.reports, 1);
  await flush();
  t.reportResult = "ok";
  w.advance(15_000);                 // the retry
  assert.equal(t.reports, 2, "retried after 15 s");
  await flush();
  w.advance(5_000);
  t.tracker.activity();              // within the minute after a delivered report: trailing, not immediate
  assert.equal(t.reports, 2);
  t.reportResult = "failed";
  w.advance(60_000);
  assert.equal(t.reports, 3, "the trailing report");
  await flush();
  t.tracker.activity();              // after a failure the next activity reports at once
  assert.equal(t.reports, 4);
});

test("review 2026-11-28: the server ending the session for another reason is not called inactivity", async () => {
  const w = world();
  const t = w.tab({ fresh: true, reportResult: "ended" });
  t.tracker.activity();
  await flush();
  assert.deepEqual(t.expired, ["ended"]);
});
