// QA 2026-11-24: a request that gets no answer at all stops after REQUEST_TIMEOUT_MS and says so in plain words,
// instead of leaving the page loading for ever. The real API client runs against a scripted fetch (no server).
import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} } };
const client = await import("../lib/api/client.ts");
const { errorMessage } = await import("../lib/api/errors.ts");

/** A fetch that never answers on its own: it only ends when its signal aborts (as a real hung connection would). */
let seenSignal = null;
const hangingFetch = async (_url, init = {}) => {
  seenSignal = init.signal;
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
};

beforeEach(() => {
  seenSignal = null;
  client.setAccessToken(null);
  mock.timers.enable({ apis: ["setTimeout"] });
});
afterEach(() => mock.timers.reset());

test("no answer within REQUEST_TIMEOUT_MS → ApiError TIMEOUT, shown in plain words", async () => {
  globalThis.fetch = hangingFetch;
  const pending = client.api("/courses", { auth: false });
  mock.timers.tick(client.REQUEST_TIMEOUT_MS - 1);
  await Promise.resolve();
  assert.equal(seenSignal.aborted, false, "still waiting just before the limit");
  mock.timers.tick(1);
  await assert.rejects(pending, (e) => {
    assert.equal(e.status, 0);
    assert.equal(e.code, "TIMEOUT");
    assert.match(errorMessage(e), /^The server took too long to answer\. Check your internet connection, then try again\./);
    assert.match(errorMessage(e), /check whether it was saved/);
    return true;
  });
});

test("the limit is generous enough for the backend host waking up (at least 60 seconds)", () => {
  assert.ok(client.REQUEST_TIMEOUT_MS >= 60_000);
});

test("an answer in time clears the clock: nothing is aborted later", async () => {
  globalThis.fetch = async (_url, init = {}) => {
    seenSignal = init.signal;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual(await client.api("/courses", { auth: false }), { ok: true });
  mock.timers.tick(client.REQUEST_TIMEOUT_MS * 2);
  assert.equal(seenSignal.aborted, false);
});

test("the caller's own cancel still cancels (a network-style error, not a timeout)", async () => {
  globalThis.fetch = hangingFetch;
  const ctrl = new AbortController();
  const pending = client.api("/courses", { auth: false, signal: ctrl.signal });
  ctrl.abort();
  await assert.rejects(pending, (e) => e.code === "NETWORK_ERROR");
});

test("a refused connection is still NETWORK_ERROR with the connection message", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(client.api("/courses", { auth: false }), (e) => {
    assert.equal(e.code, "NETWORK_ERROR");
    assert.match(errorMessage(e), /Cannot reach the server\. Check your internet connection/);
    return true;
  });
});
