// Session refresh rules (lib/api/refresh-outcome.ts): a temporary failure must
// never sign the user out; only a definite rejection does.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_RETRY_AFTER_MS,
  REFRESH_ATTEMPTS,
  UNAVAILABLE_COOLDOWN_MS,
  attemptRefresh,
  createRefresher,
  isDefiniteRejection,
  isTransient,
  retryDelayMs,
  sendWithSessionRefresh,
} from "../lib/api/refresh-outcome.ts";

// ─── helpers ────────────────────────────────────────────────────────────────

/** A response for attemptRefresh; `token` is what a 2xx body would contain. */
const reply = (status, { retryAfter = null, token = "new-access-token" } = {}) => ({
  status,
  retryAfter,
  accessToken: async () => token,
});

/** `post` that answers from a script; "network" throws like fetch does offline. */
function scripted(...steps) {
  const calls = { count: 0 };
  const post = async () => {
    const step = steps[Math.min(calls.count, steps.length - 1)];
    calls.count++;
    if (step === "network") throw new TypeError("Failed to fetch");
    return step;
  };
  return { post, calls };
}

function recordingDelay() {
  const waits = [];
  return { waits, delay: async (ms) => void waits.push(ms) };
}

/** A promise you resolve by hand, to hold a refresh "in flight". */
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

// ─── classification ─────────────────────────────────────────────────────────

test("401 and 403 are definite rejections; 429 and 5xx are transient", () => {
  for (const s of [401, 403]) assert.equal(isDefiniteRejection(s), true, String(s));
  for (const s of [400, 404, 429, 500, 502]) assert.equal(isDefiniteRejection(s), false, String(s));
  for (const s of [429, 500, 502, 503, 504]) assert.equal(isTransient(s), true, String(s));
  for (const s of [400, 401, 403, 404]) assert.equal(isTransient(s), false, String(s));
});

test("retry delay honours Retry-After (capped), otherwise backs off", () => {
  assert.equal(retryDelayMs(1, "3"), 3000);
  assert.equal(retryDelayMs(1, "120"), MAX_RETRY_AFTER_MS);
  assert.equal(retryDelayMs(1, null), 2000);
  assert.equal(retryDelayMs(2, "not-a-number"), 4000);
  assert.equal(retryDelayMs(2, ""), 4000);
  assert.equal(retryDelayMs(1, "0"), 2000);
});

// ─── attemptRefresh ─────────────────────────────────────────────────────────

test("a successful refresh returns ok with the new token, without retries", async () => {
  const { post, calls } = scripted(reply(200));
  const { delay, waits } = recordingDelay();
  assert.deepEqual(await attemptRefresh({ post, delay }), { outcome: "ok", accessToken: "new-access-token" });
  assert.equal(calls.count, 1);
  assert.deepEqual(waits, []);
});

test("a genuine token rejection (401 / 403) is rejected at once, never retried", async () => {
  for (const status of [401, 403]) {
    const { post, calls } = scripted(reply(status));
    const { delay, waits } = recordingDelay();
    assert.deepEqual(await attemptRefresh({ post, delay }), { outcome: "rejected" });
    assert.equal(calls.count, 1, `${status} sent once`);
    assert.deepEqual(waits, []);
  }
});

test("429 and 5xx are retried, then recover", async () => {
  const { post, calls } = scripted(reply(502), reply(429, { retryAfter: "1" }), reply(200));
  const { delay, waits } = recordingDelay();
  assert.equal((await attemptRefresh({ post, delay })).outcome, "ok");
  assert.equal(calls.count, 3);
  assert.deepEqual(waits, [2000, 1000]);
});

test("persistent 429 / 5xx after all retries is unavailable, not rejected", async () => {
  for (const status of [429, 500, 502, 503, 504]) {
    const { post, calls } = scripted(reply(status));
    const { delay } = recordingDelay();
    assert.deepEqual(await attemptRefresh({ post, delay }), { outcome: "unavailable" }, String(status));
    assert.equal(calls.count, REFRESH_ATTEMPTS);
  }
});

test("network errors are retried with backoff, then unavailable", async () => {
  const { post, calls } = scripted("network");
  const { delay, waits } = recordingDelay();
  assert.deepEqual(await attemptRefresh({ post, delay }), { outcome: "unavailable" });
  assert.equal(calls.count, REFRESH_ATTEMPTS);
  assert.deepEqual(waits, [1000, 2000]);
});

test("a transient failure followed by a definite rejection ends as rejected", async () => {
  const { post } = scripted("network", reply(401));
  const { delay } = recordingDelay();
  assert.equal((await attemptRefresh({ post, delay })).outcome, "rejected");
});

test("an unexpected answer (other 4xx, 2xx without a token) is unavailable, never rejected", async () => {
  for (const r of [reply(400), reply(404), reply(200, { token: null })]) {
    const { post } = scripted(r);
    const { delay } = recordingDelay();
    assert.equal((await attemptRefresh({ post, delay })).outcome, "unavailable");
  }
  const broken = { status: 200, retryAfter: null, accessToken: async () => { throw new SyntaxError("bad json"); } };
  assert.equal((await attemptRefresh({ post: async () => broken, delay: async () => {} })).outcome, "unavailable");
});

// ─── createRefresher: single flight and cooldown ────────────────────────────

test("parallel callers share one refresh (single flight)", async () => {
  let runs = 0;
  const gate = deferred();
  const r = createRefresher({ run: () => (runs++, gate.promise) });
  const calls = [r.refresh(), r.refresh(), r.refresh()];
  gate.resolve("ok");
  assert.deepEqual(await Promise.all(calls), ["ok", "ok", "ok"]);
  assert.equal(runs, 1);
  assert.equal(await r.refresh(), "ok");
  assert.equal(runs, 2, "a later call starts a new refresh");
});

test("the refresh runs inside the cross-tab lock", async () => {
  const order = [];
  const r = createRefresher({
    run: async () => (order.push("run"), "ok"),
    lock: async (fn) => {
      order.push("lock");
      const out = await fn();
      order.push("unlock");
      return out;
    },
  });
  await r.refresh();
  assert.deepEqual(order, ["lock", "run", "unlock"]);
});

test("after unavailable, refreshes answer unavailable without a request for the cooldown", async () => {
  let clock = 1_000;
  let runs = 0;
  const outcomes = ["unavailable", "ok"];
  const r = createRefresher({ run: async () => outcomes[runs++], now: () => clock });

  assert.equal(await r.refresh(), "unavailable");
  assert.equal(runs, 1);

  clock += UNAVAILABLE_COOLDOWN_MS - 1;
  assert.equal(await r.refresh(), "unavailable");
  assert.equal(runs, 1, "no request during the cooldown");

  clock += 1;
  assert.equal(await r.refresh(), "ok");
  assert.equal(runs, 2, "a request again once the cooldown is over");
});

test("clearCooldown allows an immediate refresh (the user pressed Try again)", async () => {
  let runs = 0;
  const outcomes = ["unavailable", "ok"];
  const r = createRefresher({ run: async () => outcomes[runs++], now: () => 0 });
  assert.equal(await r.refresh(), "unavailable");
  r.clearCooldown();
  assert.equal(await r.refresh(), "ok");
  assert.equal(runs, 2);
});

test("ok and rejected start no cooldown", async () => {
  let runs = 0;
  const outcomes = ["rejected", "ok", "ok"];
  const r = createRefresher({ run: async () => outcomes[runs++], now: () => 0 });
  assert.equal(await r.refresh(), "rejected");
  assert.equal(await r.refresh(), "ok");
  assert.equal(await r.refresh(), "ok");
  assert.equal(runs, 3);
});

test("an exception inside the refresh counts as unavailable, never as rejected", async () => {
  const r = createRefresher({
    run: async () => {
      throw new Error("lock manager failed");
    },
  });
  assert.equal(await r.refresh(), "unavailable");
});

// ─── sendWithSessionRefresh: who gets signed out ────────────────────────────

function flow(statuses, outcome) {
  const log = { sends: 0, refreshes: 0, expired: 0 };
  const hooks = {
    send: async () => ({ status: statuses[Math.min(log.sends++, statuses.length - 1)] }),
    refresh: async () => (log.refreshes++, outcome),
    onExpired: () => void log.expired++,
    unavailableError: () => Object.assign(new Error("unavailable"), { code: "SESSION_REFRESH_UNAVAILABLE" }),
  };
  return { hooks, log };
}

test("a non-401 answer is returned without refreshing", async () => {
  const { hooks, log } = flow([200], "ok");
  assert.equal((await sendWithSessionRefresh(hooks)).status, 200);
  assert.deepEqual(log, { sends: 1, refreshes: 0, expired: 0 });
});

test("401 → refresh ok → the request is retried once and succeeds", async () => {
  const { hooks, log } = flow([401, 200], "ok");
  assert.equal((await sendWithSessionRefresh(hooks)).status, 200);
  assert.deepEqual(log, { sends: 2, refreshes: 1, expired: 0 });
});

test("401 → refresh ok → still 401 (a fresh token refused) → signed out", async () => {
  const { hooks, log } = flow([401, 401], "ok");
  assert.equal((await sendWithSessionRefresh(hooks)).status, 401);
  assert.deepEqual(log, { sends: 2, refreshes: 1, expired: 1 });
});

test("401 → refresh rejected (genuine invalid or revoked token) → signed out", async () => {
  const { hooks, log } = flow([401], "rejected");
  assert.equal((await sendWithSessionRefresh(hooks)).status, 401);
  assert.deepEqual(log, { sends: 1, refreshes: 1, expired: 1 });
});

test("401 → refresh unavailable → NOT signed out; a SESSION_REFRESH_UNAVAILABLE error is thrown", async () => {
  const { hooks, log } = flow([401], "unavailable");
  await assert.rejects(sendWithSessionRefresh(hooks), (e) => e.code === "SESSION_REFRESH_UNAVAILABLE");
  assert.deepEqual(log, { sends: 1, refreshes: 1, expired: 0 });
});

test("no loop: one request triggers at most one refresh and one retry", async () => {
  const { hooks, log } = flow([401, 401, 401, 401], "ok");
  await sendWithSessionRefresh(hooks);
  assert.equal(log.refreshes, 1);
  assert.equal(log.sends, 2);
});

test("parallel 401s during an outage share one refresh, then the cooldown answers without requests", async () => {
  let clock = 0;
  let runs = 0;
  const gate = deferred();
  const refresher = createRefresher({ run: () => (runs++, gate.promise), now: () => clock });
  let expired = 0;
  const request = () =>
    sendWithSessionRefresh({
      send: async () => ({ status: 401 }),
      refresh: refresher.refresh,
      onExpired: () => void expired++,
      unavailableError: () => new Error("unavailable"),
    });

  const parallel = [request(), request(), request()];
  gate.resolve("unavailable");
  const results = await Promise.allSettled(parallel);
  assert.ok(results.every((r) => r.status === "rejected"), "every request reports the outage");
  assert.equal(runs, 1, "one refresh for all parallel requests");

  // Query retries during the cooldown: no new refresh request, still no sign-out.
  clock += 1_000;
  await Promise.allSettled([request(), request()]);
  assert.equal(runs, 1);
  assert.equal(expired, 0, "nobody was signed out");
});

// ─── Shared (cross-tab) cooldown ────────────────────────────────────────────
// Several createRefresher instances stand for several tabs of one browser:
// they share one lock (Web Locks: one holder at a time, FIFO) and one storage
// (localStorage); each keeps its own in-memory state, as real tabs do.

/** A FIFO mutex like navigator.locks.request, logging acquire/release. */
function sharedLock(log = []) {
  let tail = Promise.resolve();
  return (tab) => (fn) => {
    const result = tail.then(async () => {
      log.push(`${tab}:lock`);
      try {
        return await fn();
      } finally {
        log.push(`${tab}:unlock`);
      }
    });
    tail = result.catch(() => {});
    return result;
  };
}

/** localStorage stand-in holding the "unavailable until" timestamp. */
function memoryStorage(log = []) {
  let value = null;
  return {
    get: () => value,
    set: (until) => {
      log.push("storage:set");
      value = until;
    },
    clear: () => {
      log.push("storage:clear");
      value = null;
    },
    peek: () => value,
  };
}

/** Storage that throws on every call (disabled storage, private mode). */
const brokenStorage = {
  get: () => {
    throw new Error("SecurityError");
  },
  set: () => {
    throw new Error("QuotaExceededError");
  },
  clear: () => {
    throw new Error("SecurityError");
  },
};

/** N tabs. Each `run` is one full refresh cycle (its 3 attempts); `network.cycles` counts them. */
function tabs(n, { outcome = "unavailable", storage, clock = () => 0, log = [] } = {}) {
  const network = { cycles: 0 };
  const lockFor = sharedLock(log);
  const list = Array.from({ length: n }, (_, i) =>
    createRefresher({
      run: async () => {
        network.cycles++;
        log.push(`tab${i}:network`);
        return typeof outcome === "function" ? outcome(network.cycles) : outcome;
      },
      lock: lockFor(`tab${i}`),
      shared: storage,
      now: clock,
    }),
  );
  return { list, network, log };
}

test("three tabs hitting 401 during an outage: only ONE refresh cycle reaches the network", async () => {
  const storage = memoryStorage();
  const { list, network } = tabs(3, { storage });
  const outcomes = await Promise.all(list.map((t) => t.refresh()));
  assert.deepEqual(outcomes, ["unavailable", "unavailable", "unavailable"]);
  assert.equal(network.cycles, 1, "tabs 2 and 3 learned the outcome from the shared cooldown");
  assert.equal(typeof storage.peek(), "number");
});

test("five tabs: still one cycle; each tab then has its own cooldown too (no request on retry)", async () => {
  const storage = memoryStorage();
  const { list, network } = tabs(5, { storage });
  await Promise.all(list.map((t) => t.refresh()));
  await Promise.all(list.map((t) => t.refresh()));
  assert.equal(network.cycles, 1);
});

test("the shared timestamp is written before the lock is released, and read inside it", async () => {
  const log = [];
  const storage = memoryStorage(log);
  const { list } = tabs(2, { storage, log });
  await Promise.all(list.map((t) => t.refresh()));
  assert.deepEqual(log, ["tab0:lock", "tab0:network", "storage:set", "tab0:unlock", "tab1:lock", "tab1:unlock"]);
});

test("a tab joining after the shared cooldown ends makes a new request", async () => {
  let clock = 1_000;
  const storage = memoryStorage();
  const { list, network } = tabs(2, { storage, clock: () => clock });
  assert.equal(await list[0].refresh(), "unavailable");
  clock += UNAVAILABLE_COOLDOWN_MS;
  assert.equal(await list[1].refresh(), "unavailable");
  assert.equal(network.cycles, 2);
});

test("ok clears the shared cooldown; queued tabs still refresh for their own token", async () => {
  const storage = memoryStorage();
  storage.set(5_000); // left over from an earlier outage…
  const clock = 10_000; // …that is over
  const { list, network } = tabs(3, { storage, outcome: "ok", clock: () => clock });
  const outcomes = await Promise.all(list.map((t) => t.refresh()));
  assert.deepEqual(outcomes, ["ok", "ok", "ok"]);
  assert.equal(network.cycles, 3, "access tokens are per tab: each tab needs its own refresh");
  assert.equal(storage.peek(), null, "cleared");
});

test("a definite rejection clears the shared cooldown", async () => {
  const storage = memoryStorage();
  storage.set(0);
  const { list } = tabs(1, { storage, outcome: "rejected" });
  assert.equal(await list[0].refresh(), "rejected");
  assert.equal(storage.peek(), null);
});

test("recovery: after an outage, the first tab past the cooldown refreshes ok and clears it for all", async () => {
  let clock = 0;
  const storage = memoryStorage();
  const { list, network } = tabs(3, {
    storage,
    clock: () => clock,
    outcome: (cycle) => (cycle === 1 ? "unavailable" : "ok"),
  });
  await Promise.all(list.map((t) => t.refresh()));
  assert.equal(network.cycles, 1);
  clock += UNAVAILABLE_COOLDOWN_MS;
  assert.equal(await list[2].refresh(), "ok");
  assert.equal(storage.peek(), null);
  assert.equal(await list[0].refresh(), "ok", "other tabs refresh normally again");
});

test("'Try again' (clearCooldown) clears the shared cooldown, so the next tab refreshes at once", async () => {
  const storage = memoryStorage();
  const { list, network } = tabs(2, { storage, outcome: (cycle) => (cycle === 1 ? "unavailable" : "ok") });
  assert.equal(await list[0].refresh(), "unavailable");
  list[0].clearCooldown();
  assert.equal(storage.peek(), null);
  assert.equal(await list[1].refresh(), "ok");
  assert.equal(network.cycles, 2);
});

test("an exception inside the refresh is recorded as unavailable for the other tabs", async () => {
  const storage = memoryStorage();
  const lockFor = sharedLock();
  let calls = 0;
  const failing = createRefresher({
    run: async () => {
      calls++;
      throw new Error("boom");
    },
    lock: lockFor("a"),
    shared: storage,
    now: () => 0,
  });
  const other = createRefresher({ run: async () => (calls++, "ok"), lock: lockFor("b"), shared: storage, now: () => 0 });
  const [a, b] = await Promise.all([failing.refresh(), other.refresh()]);
  assert.deepEqual([a, b], ["unavailable", "unavailable"]);
  assert.equal(calls, 1);
});

test("storage that throws: each tab falls back to its own cooldown (no crash, never 'rejected')", async () => {
  const { list, network } = tabs(3, { storage: brokenStorage });
  const outcomes = await Promise.all(list.map((t) => t.refresh()));
  assert.deepEqual(outcomes, ["unavailable", "unavailable", "unavailable"]);
  assert.equal(network.cycles, 3, "the per-tab behaviour from before");
  await Promise.all(list.map((t) => t.refresh()));
  assert.equal(network.cycles, 3, "the per-tab cooldown still applies");
  assert.doesNotThrow(() => list[0].clearCooldown());
});

test("no shared storage at all: identical to the per-tab behaviour", async () => {
  const { list, network } = tabs(3, { storage: undefined });
  await Promise.all(list.map((t) => t.refresh()));
  assert.equal(network.cycles, 3);
});

test("implausible or invalid shared values are ignored, never block refreshing", async () => {
  for (const bad of [Number.NaN, 0, -1, 10_000 + UNAVAILABLE_COOLDOWN_MS + 1, 1e15, "soon"]) {
    let calls = 0;
    const r = createRefresher({
      run: async () => (calls++, "ok"),
      shared: { get: () => bad, set: () => {}, clear: () => {} },
      now: () => 10_000,
    });
    assert.equal(await r.refresh(), "ok", `value ${String(bad)}`);
    assert.equal(calls, 1);
  }
});

test("only a timestamp is stored: no token reaches the shared storage", async () => {
  const written = [];
  const r = createRefresher({
    run: async () => "unavailable",
    shared: { get: () => null, set: (v) => written.push(v), clear: () => {} },
    now: () => 1_000,
  });
  await r.refresh();
  assert.deepEqual(written, [1_000 + UNAVAILABLE_COOLDOWN_MS]);
  assert.equal(typeof written[0], "number");
});
